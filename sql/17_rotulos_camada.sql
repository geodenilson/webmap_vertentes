-- Rotulos de poligono, a pedido do Denilson em 21/10/2026 (nome dos comites no mapa).
-- Um ponto por feicao, no centro do maior circulo que cabe na parte dela dentro do
-- recorte (os seis nucleos, um nucleo ou um municipio). Rotular pelo tile repetiria o
-- nome em cada pedaco de tile; assim o nome cai uma vez, no meio da parte visivel.
-- So aceita campo de texto que exista na tabela.

create or replace function public.rotulos_camada(
    camada text,
    campo text,
    nucleo integer default null,
    municipio text default null
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

    if municipio is not null then
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

revoke all on function public.rotulos_camada(text, text, integer, text) from public, anon;
grant execute on function public.rotulos_camada(text, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
