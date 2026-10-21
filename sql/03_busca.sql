-- Busca por nucleo e por municipio, para o mapa dar zoom no recorte.
-- Devolve o retangulo em graus (SIRGAS 2000 / WGS 84), que e o que o MapLibre recebe.

create or replace function public.lugares_webmap()
returns table (
    tipo text, nome text, uf text, nucleo integer, nome_nucleo text,
    selecionado text, oeste double precision, sul double precision,
    leste double precision, norte double precision
)
language sql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
    with n as (
        select 'nucleo'::text as tipo, nome_nucleo as nome, null::text as uf,
               nucleo, nome_nucleo, selecionado,
               st_transform(geom, 4326) as g
          from vertentes.nucleos_malha_2025
    ),
    m as (
        select distinct on (cd_mun)
               'municipio'::text as tipo, nm_mun as nome, sigla_uf as uf,
               nucleo, nome_nucleo, selecionado,
               st_transform(geom, 4326) as g
          from vertentes.municipios_malha_2025
         order by cd_mun, nucleo
    )
    select tipo, nome, uf, nucleo, nome_nucleo, selecionado,
           st_xmin(g), st_ymin(g), st_xmax(g), st_ymax(g)
      from (select * from n union all select * from m) t
     order by tipo desc, nome;
$fn$;

revoke all on function public.lugares_webmap() from public, anon;
grant execute on function public.lugares_webmap() to authenticated;

notify pgrst, 'reload schema';
