-- 30/10/2026, pedido do Denilson. Com um imovel aberto, a camada de municipios era recortada
-- pelo imovel e o contorno grosso do municipio escolhido passava a correr sobre o limite do
-- imovel. O municipio e os mapas da selecao (sel_*) ficam inteiros; o resto segue o sql/27.

create or replace function public.tile(
    camada text, z integer, x integer, y integer,
    nucleo integer default null, municipio text default null, imovel integer default null,
    detalhe boolean default false
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
    -- No PDF o mapa pede o tile com detalhe: metade do pixel, entao menos feicao vira ponto
    -- e a simplificacao e mais fina.
    if detalhe then
        pixel := pixel / 2;
        passo := passo / 2;
    end if;

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
    -- Municipio e os mapas da selecao de municipios ficam inteiros: recortados, o contorno
    -- do municipio corria em cima do limite do imovel.
    if tile.imovel is not null and tem_nucleo and recorta
       and tile.camada <> 'municipios_malha_2025' and tile.camada not like 'sel\_%' then
        select i.geom into area from vertentes.car_imovel_2026_06 i where i.fid = tile.imovel;
        if area is null then
            return ''::bytea;
        end if;
        filtro := filtro || ' and st_intersects($8, t.geom)';
        if tipo_geom like '%POLYGON%' then
            filtro := filtro || ' and st_area(st_intersection($8, t.geom)) >= 0.01 * least(st_area(t.geom), st_area($8))';
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
        using z, x, y, passo, tile.nucleo, 1.5 * pixel, pixel, area, tile.municipio;
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
            -- Vira ponto so o que e estreito nas duas direcoes. A faixa fina e comprida
            -- (APP ao longo do rio) continua poligono.
            select b.*, coalesce(st_xmax(b.recortada) - st_xmin(b.recortada) < $6
                             and st_ymax(b.recortada) - st_ymin(b.recortada) < $6, true) as pequeno
              from base b
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
    using z, x, y, passo, tile.nucleo, 1.5 * pixel, pixel, area, tile.municipio;

    return coalesce(saida, ''::bytea);
end
$fn$;

revoke all on function public.tile(text, integer, integer, integer, integer, text, integer, boolean) from public, anon;
grant execute on function public.tile(text, integer, integer, integer, integer, text, integer, boolean) to authenticated;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';
