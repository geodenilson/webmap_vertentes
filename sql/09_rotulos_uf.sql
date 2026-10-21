-- Rotulo dos estados (sigla_uf), sempre ligado no mapa.
-- O ponto do rotulo cai dentro do pedaco do estado que aparece no recorte: um conjunto
-- para a vista dos seis nucleos e um para cada nucleo. Com o ponto do estado inteiro, a
-- sigla de GO ou MS cairia fora da tela quando o mapa esta num nucleo so.
-- So entra o estado que ocupa pelo menos 3% do recorte, para nao rotular lasca na borda.

create or replace function public.rotulos_uf()
returns jsonb
language sql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
    with recortes as (
        select null::integer as nucleo,
               st_expand(st_extent(geom)::geometry,
                         0.15 * greatest(st_xmax(st_extent(geom)) - st_xmin(st_extent(geom)),
                                         st_ymax(st_extent(geom)) - st_ymin(st_extent(geom)))) as caixa
          from vertentes.nucleos_malha_2025
         where selecionado = 'Sim'
        union all
        select nucleo,
               st_expand(st_envelope(geom),
                         0.25 * greatest(st_xmax(geom) - st_xmin(geom), st_ymax(geom) - st_ymin(geom)))
          from vertentes.nucleos_malha_2025
         where selecionado = 'Sim'
    ),
    pedacos as (
        select r.nucleo, e.sigla_uf,
               st_intersection(e.geom, st_setsrid(r.caixa, 3857)) as g,
               st_area(st_setsrid(r.caixa, 3857)) as area_caixa
          from recortes r
          join vertentes.limite_estadual_malha_2025 e on e.geom && st_setsrid(r.caixa, 3857)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'nucleo', nucleo,
               'uf', sigla_uf,
               'lon', round(st_x(st_transform(st_pointonsurface(g), 4326))::numeric, 4),
               'lat', round(st_y(st_transform(st_pointonsurface(g), 4326))::numeric, 4))), '[]'::jsonb)
      from pedacos
     where not st_isempty(g) and st_area(g) >= 0.03 * area_caixa;
$fn$;

revoke all on function public.rotulos_uf() from public, anon;
grant execute on function public.rotulos_uf() to authenticated;

notify pgrst, 'reload schema';
