-- Resumo de uma camada no recorte escolhido, para a pagina de informacoes do PDF.
-- 21/10/2026.
--
-- Devolve: numero de feicoes, area (ha) ou comprimento (km), area do recorte, e duas
-- listas: a soma por classe (campo_classe) e os maiores pelo nome (campo_nome).
--
-- De onde sai a medida:
--   seis nucleos ou um nucleo: campo ha_no_nucleo ou km_no_nucleo da base oficial;
--   municipio: medida geodesica da parte da feicao dentro do municipio, na copia do mapa;
--   camada sem campo de nucleo (bioma, limite estadual): medida geodesica da parte dentro
--   do recorte, o que da, por exemplo, a parte de cada bioma no nucleo.
-- Areas sao somadas feicao a feicao: sobreposicao entre feicoes conta duas vezes.

create or replace function public.resumo_camada(
    camada text,
    nucleo integer default null,
    municipio text default null,
    campo_classe text default null,
    campo_nome text default null
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

    -- Recorte e sua area oficial.
    if municipio is not null then
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

    if tem_nucleo and nucleo is not null then
        filtro := ' and t.nucleo = $2';
    elsif tem_selecao then
        filtro := ' and t.selecionado = ''Sim''';
    end if;

    -- Medida de cada feicao.
    if tipo_geom like '%POINT%' then
        medida := '0::double precision';
        unidade := null;
        if municipio is not null or not tem_nucleo then
            filtro := filtro || ' and st_intersects($1, t.geom)';
        end if;
    elsif municipio is not null or not tem_nucleo then
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
        'area_recorte', round(area_recorte::numeric),
        'origem', case when municipio is not null or not tem_nucleo then 'medida no recorte'
                       when tem_ha or tem_km then 'base oficial' else 'medida na cópia do mapa' end
    );
end
$fn$;

revoke all on function public.resumo_camada(text, integer, text, text, text) from public, anon;
grant execute on function public.resumo_camada(text, integer, text, text, text) to authenticated;

notify pgrst, 'reload schema';
