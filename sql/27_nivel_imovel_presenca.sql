-- Nivel do imovel do CAR (30/10/2026, pedido do Denilson).
-- Vizinho que so encosta na divisa do imovel deixava lasca no tile e classe com 0 ha na
-- legenda e no PDF. Agora, com um imovel aberto, o poligono so entra se a parte dentro do
-- imovel tiver pelo menos 1% da area da feicao ou da area do imovel, a menor das duas: a
-- lasca da divisa sai, a feicao pequena inteira dentro fica.
-- 1. tile: a funcao do sql/24 com essa regra no recorte pelo imovel.
-- 2. resumo_camada: a funcao do sql/25 com a mesma regra.
-- 3. camadas_presentes_imovel: as camadas com alguma feicao no imovel, para o painel e a
--    legenda mostrarem so o que ha nele, como ja fazem no nucleo e no municipio.

-- 1 -------------------------------------------------------------------------
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
    if tile.imovel is not null and tem_nucleo and recorta then
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

-- 2 -------------------------------------------------------------------------
create or replace function public.resumo_camada(
    camada text,
    nucleo integer default null,
    municipio text default null,
    campo_classe text default null,
    campo_nome text default null,
    imovel integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
declare
    tipo_geom    text;
    tem_nucleo   boolean;
    tem_selecao  boolean;
    tem_ha       boolean;
    tem_km       boolean;
    colunas      text[];
    recorte      geometry;
    area_recorte double precision;
    no_recorte   boolean;
    filtro       text := '';
    medida       text;
    unidade      text;
    classe       text := 'null::text';
    nome         text := 'null::text';
    saida        jsonb;
begin
    select upper(c.geometria) into tipo_geom from vertentes.camadas c where c.camada = resumo_camada.camada;
    if not found then
        raise exception 'camada fora do catalogo: %', resumo_camada.camada using errcode = '22023';
    end if;

    select array_agg(a.attname::text) into colunas
      from pg_attribute a
     where a.attrelid = format('vertentes.%I', resumo_camada.camada)::regclass
       and a.attnum > 0 and not a.attisdropped;
    tem_nucleo  := 'nucleo' = any (colunas);
    tem_selecao := 'selecionado' = any (colunas);
    tem_ha      := 'ha_no_nucleo' = any (colunas);
    tem_km      := 'km_no_nucleo' = any (colunas);

    -- Recorte e sua area.
    if imovel is not null then
        select i.geom, st_area(st_transform(i.geom, 4326)::geography) / 1e4 into recorte, area_recorte
          from vertentes.car_imovel_2026_06 i where i.fid = resumo_camada.imovel;
    elsif municipio is not null then
        select st_union(m.geom), sum(m.area_ha) into recorte, area_recorte
          from vertentes.municipios_malha_2025 m
         where m.cd_mun = resumo_camada.municipio
           and (resumo_camada.nucleo is null or m.nucleo = resumo_camada.nucleo);
    elsif nucleo is not null then
        select st_union(n.geom), sum(n.area_ha) into recorte, area_recorte
          from vertentes.nucleos_malha_2025 n where n.nucleo = resumo_camada.nucleo;
    else
        select st_union(n.geom), sum(n.area_ha) into recorte, area_recorte
          from vertentes.nucleos_malha_2025 n where n.selecionado = 'Sim';
    end if;
    no_recorte := imovel is not null or municipio is not null or not tem_nucleo;

    if tem_nucleo and nucleo is not null then
        filtro := ' and t.nucleo = $2';
    elsif tem_selecao then
        filtro := ' and t.selecionado = ''Sim''';
    end if;
    if imovel is not null then
        filtro := filtro || ' and not st_touches($1, t.geom)';
        if tipo_geom like '%POLYGON%' then
            filtro := filtro || ' and st_area(st_intersection($1, t.geom)) >= 0.01 * least(st_area(t.geom), st_area($1))';
        end if;
    end if;

    -- Medida de cada feicao.
    if tipo_geom like '%POINT%' then
        medida := '0::double precision';
        unidade := null;
        if no_recorte then
            filtro := filtro || ' and st_intersects($1, t.geom)';
        end if;
    elsif no_recorte then
        -- O recorte geometrico so para quem cruza a borda; quem esta inteiro dentro entra
        -- com a medida da feicao toda, bem mais rapido.
        filtro := filtro || ' and t.geom && $1 and st_intersects($1, t.geom)';
        if tipo_geom like '%POLYGON%' then
            medida := 'st_area(st_transform(case when st_contains($1, t.geom) then t.geom
                        else st_collectionextract(st_intersection(t.geom, $1), 3) end, 4326)::geography) / 1e4';
            unidade := 'ha';
        else
            medida := 'st_length(st_transform(case when st_contains($1, t.geom) then t.geom
                        else st_collectionextract(st_intersection(t.geom, $1), 2) end, 4326)::geography) / 1e3';
            unidade := 'km';
        end if;
    elsif tem_ha then
        medida := 'coalesce(t.ha_no_nucleo, 0)';
        unidade := 'ha';
    elsif tem_km then
        medida := 'coalesce(t.km_no_nucleo, 0)';
        unidade := 'km';
    elsif tipo_geom like '%POLYGON%' then
        medida := 'st_area(st_transform(t.geom, 4326)::geography) / 1e4';
        unidade := 'ha';
    else
        medida := 'st_length(st_transform(t.geom, 4326)::geography) / 1e3';
        unidade := 'km';
    end if;

    -- Classe e nome, so se o campo existe na tabela.
    if campo_classe = 'mod_fiscal' and 'mod_fiscal' = any (colunas) then
        classe := 'case when t.mod_fiscal <= 4 then ''até 4 módulos fiscais''
                        when t.mod_fiscal < 10 then ''acima de 4 a menos de 10''
                        when t.mod_fiscal <= 15 then ''de 10 a 15''
                        else ''acima de 15'' end';
    elsif campo_classe = any (colunas) then
        classe := format('nullif(trim(t.%I::text), '''')', campo_classe);
    end if;
    if campo_nome = any (colunas) then
        nome := format('nullif(trim(t.%I::text), '''')', campo_nome);
    end if;

    execute format(
        $q$
        with base as (
            select %1$s as classe, %2$s as nome, %3$s as medida
              from vertentes.%4$I t
             where true %5$s
        )
        select jsonb_build_object(
            'feicoes', (select count(*) from base),
            'medida', (select round(coalesce(sum(medida), 0)::numeric, 1) from base),
            'classes', (select coalesce(jsonb_agg(jsonb_build_object('classe', classe, 'feicoes', n, 'medida', m)
                                                  order by m desc nulls last, n desc), '[]'::jsonb)
                          from (select classe, count(*) n, round(sum(medida)::numeric, 1) m
                                  from base where classe is not null
                                 group by classe order by sum(medida) desc nulls last, count(*) desc
                                 limit 10) c),
            'maiores', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'feicoes', n, 'medida', m)
                                                  order by m desc nulls last, n desc), '[]'::jsonb)
                          from (select nome, count(*) n, round(sum(medida)::numeric, 1) m
                                  from base where nome is not null
                                 group by nome order by sum(medida) desc nulls last, count(*) desc
                                 limit 8) g)
        )
        $q$,
        classe, nome, medida, resumo_camada.camada, filtro
    )
    into saida
    using recorte, resumo_camada.nucleo;

    return saida || jsonb_build_object(
        'unidade', unidade,
        'area_recorte', round(area_recorte::numeric, case when imovel is not null then 1 else 0 end),
        'origem', case when no_recorte then 'medida no recorte'
                       when tem_ha or tem_km then 'base oficial' else 'medida na cópia do mapa' end
    );
end
$fn$;

revoke all on function public.resumo_camada(text, integer, text, text, text, integer) from public, anon;
grant execute on function public.resumo_camada(text, integer, text, text, text, integer) to authenticated;

notify pgrst, 'reload schema';

-- 3 -------------------------------------------------------------------------
create or replace function public.camadas_presentes_imovel(imovel integer)
returns setof text
language plpgsql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
declare
    area   geometry;
    c      record;
    achou  boolean;
begin
    select i.geom into area from vertentes.car_imovel_2026_06 i where i.fid = camadas_presentes_imovel.imovel;
    if area is null then
        return;
    end if;
    for c in
        select k.camada, upper(k.geometria) as tipo
          from vertentes.camadas k
         where exists (select 1 from pg_attribute a
                        where a.attrelid = format('vertentes.%I', k.camada)::regclass
                          and a.attname = 'nucleo' and not a.attisdropped)
    loop
        execute format(
            'select exists (select 1 from vertentes.%I t where t.geom && $1 and st_intersects($1, t.geom)'
            || case when c.tipo like '%%POLYGON%%'
                    then ' and not st_touches($1, t.geom) and st_area(st_intersection($1, t.geom)) >= 0.01 * least(st_area(t.geom), st_area($1))'
                    when c.tipo like '%%LINE%%' then ' and not st_touches($1, t.geom)'
                    else '' end
            || ')', c.camada)
          into achou using area;
        if achou then
            return next c.camada;
        end if;
    end loop;
end
$fn$;

revoke all on function public.camadas_presentes_imovel(integer) from public, anon;
grant execute on function public.camadas_presentes_imovel(integer) to authenticated;

notify pgrst, 'reload schema';
