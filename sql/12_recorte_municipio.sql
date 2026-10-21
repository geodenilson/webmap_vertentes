-- Recorte por municipio, a pedido do Denilson em 16/10/2026.
-- Depende da coluna recorta_municipio, criada no sql/13: rodar o 13 antes deste.
-- Com um municipio escolhido, cada camada chega recortada pelo contorno do municipio:
-- a feicao que cruza a divisa vem so com o pedaco de dentro. Bioma e limite estadual
-- continuam inteiros como contexto. A camada de municipios mostra so o escolhido.
-- O municipio e identificado por codigo e nucleo juntos: Brasilia vem repartida, um
-- pedaco por nucleo.

drop function if exists public.tile(text, integer, integer, integer, integer);

create or replace function public.tile(
    camada text, z integer, x integer, y integer,
    nucleo integer default null, municipio text default null
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
    -- Pixel de tela no zoom pedido (tile de 512 px do MapLibre).
    pixel          double precision := 40075016.68557849 / (512 * 2 ^ z);
    -- Metade de um pixel de 256: abaixo disso a simplificacao nao aparece.
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

    -- Recorte pelo municipio. So nas camadas com campo de nucleo: as de contexto ficam inteiras,
    -- e a de nucleos tambem (recorta_municipio = false), para o limite do nucleo nao sumir.
    if tile.municipio is not null and tem_nucleo and recorta then
        if tile.camada = 'municipios_malha_2025' then
            filtro := filtro || ' and t.cd_mun = $9';
        else
            -- O contorno do corte e simplificado em meio pixel do zoom pedido: a diferenca nao
            -- aparece na tela e o corte fica muito mais leve.
            select st_simplifypreservetopology(st_union(m.geom), passo) into area
              from vertentes.municipios_malha_2025 m
             where m.cd_mun = tile.municipio and (tile.nucleo is null or m.nucleo = tile.nucleo);
            if area is null then
                return ''::bytea;
            end if;
            filtro := filtro || ' and st_intersects($8, t.geom)';
            -- So corta a feicao que cruza a divisa; a que esta inteira dentro passa como esta.
            if tipo_geom like '%POLYGON%' then
                g := 'case when st_contains($8, t.geom) then t.geom else st_collectionextract(st_intersection(t.geom, $8), 3) end';
            elsif tipo_geom like '%LINE%' then
                g := 'case when st_contains($8, t.geom) then t.geom else st_collectionextract(st_intersection(t.geom, $8), 2) end';
            end if;
        end if;
    end if;

    if not ponto then
        execute format(
            $q$
            with limite as (select st_tileenvelope($1, $2, $3) as e),
            feicoes as (
                select %1$s
                       st_asmvtgeom(case when $1 < 12 then st_simplify(%2$s, $4) else %2$s end,
                                    limite.e, 4096, 64, true) as geom
                  from vertentes.%3$I t, limite
                 where t.geom && limite.e %4$s
            )
            select st_asmvt(feicoes, %5$L, 4096, 'geom') from feicoes where geom is not null
            $q$,
            coalesce(colunas || ',', ''), g, tile.camada, filtro, tile.camada
        )
        into saida
        using z, x, y, passo, tile.nucleo, (2 * pixel) ^ 2, pixel, area, tile.municipio;
        return coalesce(saida, ''::bytea);
    end if;

    select coalesce(string_agg(format('t.%I', c), ', '), '1') into lista_chaves from unnest(chaves) c;

    -- Abaixo do zoom 10, a escala do nucleo inteiro, o poligono tambem so leva o campo da cor.
    -- Os atributos completos voltam ao aproximar, para a consulta por clique.
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
            select %4$s
                   st_asmvtgeom(case when $1 < 12 then st_simplify(t.recortada, $4) else t.recortada end,
                                limite.e, 4096, 64, true) as geom
              from medida t, limite
             where not t.pequeno
        ),
        pontos as (
            select distinct on (t.g, %6$s) %5$s
                   st_asmvtgeom(t.g, limite.e, 4096, 64, true) as geom
              from (select b.*, st_snaptogrid(st_centroid(b.recortada), $7) as g
                      from medida b where b.pequeno and not st_isempty(b.recortada)) t, limite
        )
        select st_asmvt(f, %7$L, 4096, 'geom')
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

revoke all on function public.tile(text, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.tile(text, integer, integer, integer, integer, text) to authenticated;

-- Municipios de cada nucleo em execucao, com o retangulo em graus para o zoom.
create or replace function public.municipios_webmap()
returns table (
    cd_mun text, nm_mun text, uf text, nucleo integer,
    oeste double precision, sul double precision, leste double precision, norte double precision
)
language sql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
    select m.cd_mun, m.nm_mun, m.sigla_uf, m.nucleo,
           st_xmin(g), st_ymin(g), st_xmax(g), st_ymax(g)
      from vertentes.municipios_malha_2025 m,
           lateral (select st_transform(m.geom, 4326) as g) t
     where m.selecionado = 'Sim'
     order by m.nucleo, m.nm_mun;
$fn$;

revoke all on function public.municipios_webmap() from public, anon;
grant execute on function public.municipios_webmap() to authenticated;

-- Contorno dos municipios de um nucleo, simplificado, para o mapinha "No nucleo" do PDF.
create or replace function public.contornos_municipios(nucleo integer)
returns jsonb
language sql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
    select coalesce(jsonb_agg(jsonb_build_object(
               'cd_mun', m.cd_mun,
               'nome', m.nm_mun,
               'geometria', st_asgeojson(st_simplifypreservetopology(st_transform(m.geom, 4326), 0.004), 3)::jsonb)
           order by m.nm_mun), '[]'::jsonb)
      from vertentes.municipios_malha_2025 m
     where m.selecionado = 'Sim' and m.nucleo = contornos_municipios.nucleo;
$fn$;

revoke all on function public.contornos_municipios(integer) from public, anon;
grant execute on function public.contornos_municipios(integer) to authenticated;

notify pgrst, 'reload schema';
