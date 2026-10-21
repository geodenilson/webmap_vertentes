-- Sigla do estado fora do desenho do nucleo, a pedido do Denilson em 16/10/2026.
-- O ponto sai do maior pedaco do estado que fica dentro do recorte e fora do nucleo, com
-- folga de 4% do recorte em volta do nucleo e da borda da tela. Na vista geral, desconta
-- os seis nucleos; com um nucleo escolhido, so ele, que e o unico desenhado.
-- Se o estado inteiro cai dentro do nucleo, a sigla volta para o pedaco de antes.

create or replace function public.rotulos_uf()
returns jsonb
language sql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
    with seis as (
        select nucleo, geom from vertentes.nucleos_malha_2025 where selecionado = 'Sim'
    ),
    recortes as (
        select null::integer as nucleo,
               st_expand(st_extent(geom)::geometry,
                         0.15 * greatest(st_xmax(st_extent(geom)) - st_xmin(st_extent(geom)),
                                         st_ymax(st_extent(geom)) - st_ymin(st_extent(geom)))) as caixa,
               st_union(geom) as desenho
          from seis
        union all
        select nucleo,
               st_expand(st_envelope(geom),
                         0.25 * greatest(st_xmax(geom) - st_xmin(geom), st_ymax(geom) - st_ymin(geom))),
               geom
          from seis
    ),
    medidas as (
        select nucleo, st_setsrid(caixa, 3857) as caixa, desenho,
               0.04 * greatest(st_xmax(caixa) - st_xmin(caixa), st_ymax(caixa) - st_ymin(caixa)) as folga
          from recortes
    ),
    pedacos as (
        select m.nucleo, e.sigla_uf,
               st_intersection(e.geom, m.caixa) as dentro,
               st_difference(
                   st_intersection(e.geom, st_buffer(m.caixa, -m.folga)),
                   st_buffer(m.desenho, m.folga)
               ) as fora,
               st_area(m.caixa) as area_caixa
          from medidas m
          join vertentes.limite_estadual_malha_2025 e on e.geom && m.caixa
    ),
    escolhidos as (
        select p.nucleo, p.sigla_uf,
               coalesce(
                   (select d.geom from st_dump(p.fora) d
                     where not st_isempty(d.geom)
                     order by st_area(d.geom) desc limit 1),
                   p.dentro
               ) as alvo
          from pedacos p
         where not st_isempty(p.dentro) and st_area(p.dentro) >= 0.03 * p.area_caixa
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'nucleo', nucleo,
               'uf', sigla_uf,
               'lon', round(st_x(st_transform(st_pointonsurface(alvo), 4326))::numeric, 4),
               'lat', round(st_y(st_transform(st_pointonsurface(alvo), 4326))::numeric, 4))), '[]'::jsonb)
      from escolhidos;
$fn$;

revoke all on function public.rotulos_uf() from public, anon;
grant execute on function public.rotulos_uf() to authenticated;

notify pgrst, 'reload schema';
