-- A conta da sigla fora do nucleo leva cerca de 100 s, por causa da folga em volta do
-- contorno dos nucleos. O mapa pede os rotulos toda vez que abre, e o limite e 15 s.
-- A conta fica numa visao materializada, feita uma vez; a funcao so le dela.
-- O recorte e o nucleo com folga de 6% (5% na vista dos seis) e a sigla fica a 2% do contorno:
-- colada ao desenho, ela aparece em qualquer janela que mostre o nucleo.
-- Quando a base mudar:  refresh materialized view vertentes.rotulos_uf_pontos;

drop materialized view if exists vertentes.rotulos_uf_pontos;

create materialized view vertentes.rotulos_uf_pontos as
with seis as (
    select nucleo, geom from vertentes.nucleos_malha_2025 where selecionado = 'Sim'
),
recortes as (
    select null::integer as nucleo,
           extensions.st_expand(extensions.st_extent(geom)::extensions.geometry,
                     0.05 * greatest(extensions.st_xmax(extensions.st_extent(geom)) - extensions.st_xmin(extensions.st_extent(geom)),
                                     extensions.st_ymax(extensions.st_extent(geom)) - extensions.st_ymin(extensions.st_extent(geom)))) as caixa,
           extensions.st_union(geom) as desenho
      from seis
    union all
    select nucleo,
           extensions.st_expand(extensions.st_envelope(geom),
                     0.06 * greatest(extensions.st_xmax(geom) - extensions.st_xmin(geom),
                                     extensions.st_ymax(geom) - extensions.st_ymin(geom))),
           geom
      from seis
),
medidas as (
    select nucleo, extensions.st_setsrid(caixa, 3857) as caixa,
           -- A folga sai de um contorno simplificado: o detalhe da borda nao muda o lugar
           -- da sigla e deixa a conta bem mais leve.
           extensions.st_simplify(desenho, 2000) as desenho,
           0.02 * greatest(extensions.st_xmax(caixa) - extensions.st_xmin(caixa),
                           extensions.st_ymax(caixa) - extensions.st_ymin(caixa)) as folga
      from recortes
),
pedacos as (
    select m.nucleo, e.sigla_uf,
           extensions.st_intersection(e.geom, m.caixa) as dentro,
           extensions.st_difference(
               extensions.st_intersection(e.geom, extensions.st_buffer(m.caixa, -m.folga)),
               extensions.st_buffer(m.desenho, m.folga)
           ) as fora,
           extensions.st_area(m.caixa) as area_caixa
      from medidas m
      join vertentes.limite_estadual_malha_2025 e on e.geom operator(extensions.&&) m.caixa
),
escolhidos as (
    select p.nucleo, p.sigla_uf,
           coalesce(
               (select d.geom from extensions.st_dump(p.fora) d
                 where not extensions.st_isempty(d.geom)
                 order by extensions.st_area(d.geom) desc limit 1),
               p.dentro
           ) as alvo
      from pedacos p
     where not extensions.st_isempty(p.dentro) and extensions.st_area(p.dentro) >= 0.03 * p.area_caixa
)
select nucleo, sigla_uf as uf,
       round(extensions.st_x(extensions.st_transform(extensions.st_pointonsurface(alvo), 4326))::numeric, 4) as lon,
       round(extensions.st_y(extensions.st_transform(extensions.st_pointonsurface(alvo), 4326))::numeric, 4) as lat
  from escolhidos;

create or replace function public.rotulos_uf()
returns jsonb
language sql
stable
security definer
set search_path = vertentes, pg_temp
as $fn$
    select coalesce(jsonb_agg(jsonb_build_object('nucleo', nucleo, 'uf', uf, 'lon', lon, 'lat', lat)), '[]'::jsonb)
      from vertentes.rotulos_uf_pontos;
$fn$;

revoke all on function public.rotulos_uf() from public, anon;
grant execute on function public.rotulos_uf() to authenticated;

notify pgrst, 'reload schema';
