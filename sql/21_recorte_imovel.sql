-- Recorte pelo imovel aberto (23/10/2026). Com um imovel do CAR aberto, todos os temas
-- chegam cortados pelo limite dele, como ja acontece com o municipio. A camada de nucleos
-- (recorta_municipio = false), o bioma e o limite estadual continuam inteiros.
-- tile() e rotulos_camada() ganham o parametro imovel (fid interno do CAR).

drop function if exists public.tile(text, integer, integer, integer, integer, text);

create or replace function public.tile(
    camada text, z integer, x integer, y integer,
    nucleo integer default null, municipio text default null, imovel integer default null
)
returns "application/vnd.mapbox-vector-tile"
language plpgsql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
declare
    zmin           integer;
    ponto          boolean;
    chaves         text[];
    tipo_geom      text;
    recorta        boolean;
    colunas        text;
    colunas_ponto  text;
    lista_chaves   text;
    tem_nucleo     boolean;
    tem_selecao    boolean;
    filtro         text := '';
    g              text := 't.geom';
    area           geometry;
    pixel          double precision := 40075016.68557849 / (512 * 2 ^ z);
    passo          double precision := 40075016.68557849 / (256 * 2 ^ z) / 2;
    saida          bytea;
begin
    select c.zoom_minimo, c.vira_ponto, coalesce(c.campos_ponto, array[]::text[]), upper(c.geometria),
           c.recorta_municipio
      into zmin, ponto, chaves, tipo_geom, recorta
      from vertentes.camadas c where c.camada = tile.camada;
    if not found then
        raise exception 'camada fora do catalogo: %', tile.camada using errcode = '22023';
    end if;
    if tile.nucleo is null and z < zmin then
        return ''::bytea;
    end if;

    select string_agg(format('t.%I', a.attname), ', ' order by a.attnum),
           string_agg(
               case when a.attname = any (chaves) then format('t.%I', a.attname)
                    else format('null::%s as %I', format_type(a.atttypid, a.atttypmod), a.attname) end,
               ', ' order by a.attnum),
           bool_or(a.attname = 'nucleo'),
           bool_or(a.attname = 'selecionado')
      into colunas, colunas_ponto, tem_nucleo, tem_selecao
      from pg_attribute a
     where a.attrelid = format('vertentes.%I', tile.camada)::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('geom', 'fid');

    if tile.nucleo is not null and tem_nucleo then
        filtro := ' and t.nucleo = $5';
    elsif tem_selecao then
        filtro := ' and t.selecionado = ''Sim''';
    end if;

    if tile.municipio is not null and tem_nucleo and recorta then
        if tile.camada = 'municipios_malha_2025' then
            filtro := filtro || ' and t.cd_mun = $9';
        else
            select st_simplifypreservetopology(st_union(m.geom), passo) into area
              from vertentes.municipios_malha_2025 m
             where m.cd_mun = tile.municipio and (tile.nucleo is null or m.nucleo = tile.nucleo);
            if area is null then
                return ''::bytea;
            end if;
            filtro := filtro || ' and st_intersects($8, t.geom)';
            if tipo_geom like '%POLYGON%' then
                g := 'case when st_contains($8, t.geom) then t.geom else st_collectionextract(st_intersection(t.geom, $8), 3) end';
            elsif tipo_geom like '%LINE%' then
                g := 'case when st_contains($8, t.geom) then t.geom else st_collectionextract(st_intersection(t.geom, $8), 2) end';
            end if;
        end if;
    end if;

    -- Imovel aberto: todo tema com campo de nucleo chega recortado pelo limite do imovel.
    if tile.imovel is not null and tem_nucleo and recorta then
        select i.geom into area from vertentes.car_imovel_2026_06 i where i.fid = tile.imovel;
        if area is null then
            return ''::bytea;
        end if;
        filtro := filtro || ' and st_intersects($8, t.geom)';
        if tipo_geom like '%POLYGON%' then
            g := 'case when st_contains($8, t.geom) then t.geom else st_collectionextract(st_intersection(t.geom, $8), 3) end';
        elsif tipo_geom like '%LINE%' then
            g := 'case when st_contains($8, t.geom) then t.geom else st_collectionextract(st_intersection(t.geom, $8), 2) end';
        end if;
    end if;

    if not ponto then
        execute format(
            $q$
            with limite as (select st_tileenvelope($1, $2, $3) as e),
            feicoes as (
                select %1$s t.fid as id_feicao,
                       st_asmvtgeom(case when $1 < 12 then st_simplify(%2$s, $4) else %2$s end,
                                    limite.e, 4096, 64, true) as geom
                  from vertentes.%3$I t, limite
                 where t.geom && limite.e %4$s
            )
            select st_asmvt(feicoes, %5$L, 4096, 'geom', 'id_feicao') from feicoes where geom is not null
            $q$,
            coalesce(colunas || ',', ''), g, tile.camada, filtro, tile.camada
        )
        into saida
        using z, x, y, passo, tile.nucleo, (2 * pixel) ^ 2, pixel, area, tile.municipio;
        return coalesce(saida, ''::bytea);
    end if;

    select coalesce(string_agg(format('t.%I', c), ', '), '1') into lista_chaves from unnest(chaves) c;

    if z < 10 then
        colunas := colunas_ponto;
    end if;

    execute format(
        $q$
        with limite as (select st_tileenvelope($1, $2, $3) as e),
        base as (
            select t.*, %2$s as recortada
              from vertentes.%1$I t, limite
             where t.geom && limite.e %3$s
        ),
        medida as (
            select b.*, st_area(b.recortada) < $6 as pequeno from base b
        ),
        poligonos as (
            select %4$s t.fid as id_feicao,
                   st_asmvtgeom(case when $1 < 12 then st_simplify(t.recortada, $4) else t.recortada end,
                                limite.e, 4096, 64, true) as geom
              from medida t, limite
             where not t.pequeno
        ),
        pontos as (
            select distinct on (t.g, %6$s) %5$s null::integer as id_feicao,
                   st_asmvtgeom(t.g, limite.e, 4096, 64, true) as geom
              from (select b.*, st_snaptogrid(st_centroid(b.recortada), $7) as g
                      from medida b where b.pequeno and not st_isempty(b.recortada)) t, limite
        )
        select st_asmvt(f, %7$L, 4096, 'geom', 'id_feicao')
          from (select * from poligonos union all select * from pontos) f
         where geom is not null
        $q$,
        tile.camada, g, filtro,
        coalesce(colunas || ',', ''), coalesce(colunas_ponto || ',', ''),
        lista_chaves, tile.camada
    )
    into saida
    using z, x, y, passo, tile.nucleo, (2 * pixel) ^ 2, pixel, area, tile.municipio;

    return coalesce(saida, ''::bytea);
end
$fn$;

revoke all on function public.tile(text, integer, integer, integer, integer, text, integer) from public, anon;
grant execute on function public.tile(text, integer, integer, integer, integer, text, integer) to authenticated;

drop function if exists public.rotulos_camada(text, text, integer, text);

create or replace function public.rotulos_camada(
    camada text,
    campo text,
    nucleo integer default null,
    municipio text default null,
    imovel integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
declare
    tipo_campo  text;
    tem_nucleo  boolean;
    tem_selecao boolean;
    recorte     geometry;
    filtro      text := '';
    saida       jsonb;
begin
    if not exists (select 1 from vertentes.camadas c where c.camada = rotulos_camada.camada) then
        raise exception 'camada fora do catalogo: %', rotulos_camada.camada using errcode = '22023';
    end if;

    select format_type(a.atttypid, a.atttypmod) into tipo_campo
      from pg_attribute a
     where a.attrelid = format('vertentes.%I', rotulos_camada.camada)::regclass
       and a.attname = rotulos_camada.campo and a.attnum > 0 and not a.attisdropped;
    if tipo_campo is null or not (tipo_campo like 'character varying%' or tipo_campo = 'text') then
        raise exception 'campo sem texto: %', rotulos_camada.campo using errcode = '22023';
    end if;

    select bool_or(a.attname = 'nucleo'), bool_or(a.attname = 'selecionado') into tem_nucleo, tem_selecao
      from pg_attribute a
     where a.attrelid = format('vertentes.%I', rotulos_camada.camada)::regclass
       and a.attnum > 0 and not a.attisdropped;

    if imovel is not null then
        select i.geom into recorte from vertentes.car_imovel_2026_06 i where i.fid = rotulos_camada.imovel;
    elsif municipio is not null then
        select st_simplifypreservetopology(st_union(m.geom), 50) into recorte
          from vertentes.municipios_malha_2025 m
         where m.cd_mun = rotulos_camada.municipio
           and (rotulos_camada.nucleo is null or m.nucleo = rotulos_camada.nucleo);
    elsif nucleo is not null then
        select st_simplifypreservetopology(st_union(n.geom), 100) into recorte
          from vertentes.nucleos_malha_2025 n where n.nucleo = rotulos_camada.nucleo;
    else
        select st_simplifypreservetopology(st_union(n.geom), 200) into recorte
          from vertentes.nucleos_malha_2025 n where n.selecionado = 'Sim';
    end if;

    if tem_nucleo and nucleo is not null then
        filtro := ' and t.nucleo = $2';
    elsif tem_selecao then
        filtro := ' and t.selecionado = ''Sim''';
    end if;

    -- A camada de municipios, num municipio escolhido, rotula so ele.
    if rotulos_camada.camada = 'municipios_malha_2025' and municipio is not null then
        filtro := filtro || ' and t.cd_mun = $3';
    end if;

    execute format(
        $q$
        with base as (
            select nullif(trim(t.%1$I::text), '') as nome,
                   case when st_contains($1, t.geom) then st_simplifypreservetopology(t.geom, 50)
                        else st_collectionextract(st_intersection(st_simplifypreservetopology(t.geom, 50), $1), 3) end as g
              from vertentes.%2$I t
             where t.geom && $1 and st_intersects($1, t.geom) %3$s
             limit 3000
        )
        select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(
                   jsonb_build_object(
                       'type', 'Feature',
                       'properties', jsonb_build_object('nome', nome),
                       'geometry', st_asgeojson(st_transform((st_maximuminscribedcircle(g)).center, 4326), 5)::jsonb)
               ), '[]'::jsonb))
          from base
         where nome is not null and not st_isempty(g)
        $q$,
        rotulos_camada.campo, rotulos_camada.camada, filtro
    )
    into saida
    using recorte, rotulos_camada.nucleo, rotulos_camada.municipio;

    return saida;
end
$fn$;

revoke all on function public.rotulos_camada(text, text, integer, text, integer) from public, anon;
grant execute on function public.rotulos_camada(text, text, integer, text, integer) to authenticated;



notify pgrst, 'reload schema';
