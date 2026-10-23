-- Nivel do imovel do CAR, a pedido do Denilson em 23/10/2026.
-- Depois do municipio, um quarto nivel: o imovel. Nele o mapa mostra a imagem Planet de
-- 09/2026 e a vegetacao mapeada, recortadas pelo imovel com 100 m de folga.
--
-- 1. tile(): cada feicao de poligono leva o fid como id do MVT, para o clique saber qual
--    imovel foi escolhido. O fid e interno do banco; o cod_imovel continua fora da web.
-- 2. vertentes.planet_cenas: retangulo de cada cena COG guardada no Storage (bucket planet).
-- 3. vertentes.vegetacao: a vegetacao mapeada (Vegetacao_Vertentes.gpkg), sobe pelo ogr2ogr.
-- 4. public.imovel_webmap(id): tudo o que o nivel do imovel precisa, numa chamada.

-- 1. Tile com id -----------------------------------------------------------------

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

revoke all on function public.tile(text, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.tile(text, integer, integer, integer, integer, text) to authenticated;

-- 2. Cenas Planet ------------------------------------------------------------------

create table if not exists vertentes.planet_cenas (
    cena     text primary key,
    arquivo  text not null,
    data     text not null default '09/2026',
    geom     geometry(Polygon, 3857) not null
);
create index if not exists planet_cenas_geom on vertentes.planet_cenas using gist (geom);
alter table vertentes.planet_cenas enable row level security;

-- 3. Vegetacao: a tabela vertentes.vegetacao (fid, cena, geom MultiPolygon 3857) e criada
--    pelo ogr2ogr; o indice vem depois da carga, em 19_vegetacao_indice.sql.

-- 4. Tudo do imovel numa chamada ---------------------------------------------------
-- Area em hectares pela geografia. A faixa de 100 m e medida no terreno (geography), e
-- em Web Mercator fica maior perto dos polos, por isso o buffer nao e feito em 3857.
-- Vegetacao e passivo sao cortados pela faixa para o desenho e pelo imovel para a conta.

create or replace function public.imovel_webmap(id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
declare
    im         record;
    faixa      geometry;
    area_ha    double precision;
    tol        double precision;
    saida      jsonb;
begin
    select i.fid, i.geom, i.mod_fiscal, i.municipio, i.nucleo, i.nome_nucleo, i.ind_status,
           i.ind_tipo, i.des_condic
      into im
      from vertentes.car_imovel_2026_06 i
     where i.fid = imovel_webmap.id and i.selecionado = 'Sim';
    if not found then
        return null;
    end if;

    area_ha := st_area(st_transform(im.geom, 4326)::geography) / 1e4;
    faixa := st_transform(st_buffer(st_transform(im.geom, 4326)::geography, 100)::geometry, 3857);
    -- Imovel grande devolve a vegetacao mais simplificada, para a resposta nao pesar.
    tol := case when area_ha > 20000 then 6 when area_ha > 5000 then 3 else 1 end;

    with veg as (
        select st_intersection(v.geom, faixa) as g, v.geom as inteira
          from vertentes.vegetacao v
         where v.geom && faixa and st_intersects(v.geom, faixa)
    ),
    pas as (
        select p.classe, st_intersection(p.geom, im.geom) as g
          from vertentes.car_passivo_2026_06 p
         where p.geom && im.geom and st_intersects(p.geom, im.geom)
    )
    select jsonb_build_object(
        'id', im.fid,
        'municipio', im.municipio,
        'nucleo', im.nucleo,
        'nome_nucleo', im.nome_nucleo,
        'mod_fiscal', round(im.mod_fiscal::numeric, 2),
        'status', im.ind_status,
        'tipo', im.ind_tipo,
        'condicao', im.des_condic,
        'area_ha', round(area_ha::numeric, 1),
        'caixa', (select jsonb_build_array(st_xmin(b), st_ymin(b), st_xmax(b), st_ymax(b))
                    from (select st_transform(faixa, 4326) as b) q),
        'imovel', st_asgeojson(st_transform(im.geom, 4326), 6)::jsonb,
        'faixa', st_asgeojson(st_transform(faixa, 4326), 6)::jsonb,
        'veg_ha_imovel', (select round(coalesce(sum(st_area(st_transform(st_intersection(inteira, im.geom), 4326)::geography)), 0)::numeric / 1e4, 1)
                            from veg where st_intersects(inteira, im.geom)),
        'vegetacao', jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(
            (select jsonb_agg(jsonb_build_object('type', 'Feature', 'properties', '{}'::jsonb,
                     'geometry', st_asgeojson(st_transform(st_simplifypreservetopology(g, tol), 4326), 6)::jsonb))
               from veg where not st_isempty(g)), '[]'::jsonb)),
        'passivo', coalesce((select jsonb_object_agg(classe, ha)
                               from (select classe, round(sum(st_area(st_transform(g, 4326)::geography))::numeric / 1e4, 1) as ha
                                       from pas where not st_isempty(g) group by classe) q), '{}'::jsonb),
        'cenas', coalesce((select jsonb_agg(jsonb_build_object('cena', c.cena, 'arquivo', c.arquivo, 'data', c.data)
                                            order by c.cena)
                             from vertentes.planet_cenas c where c.geom && faixa), '[]'::jsonb)
    ) into saida;
    return saida;
end
$fn$;

revoke all on function public.imovel_webmap(integer) from public, anon;
grant execute on function public.imovel_webmap(integer) to authenticated;

notify pgrst, 'reload schema';
