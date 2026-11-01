-- 01/11/2026, botao "Onde estou" do celular: o que ha no ponto do GPS.
-- Devolve os municipios dos nucleos em execucao e os imoveis do CAR que contem o ponto. Um
-- municipio pode vir duas vezes (Brasilia esta nos nucleos 3 e 9) e um ponto pode cair em
-- mais de um imovel, porque o CAR tem sobreposicao: o app deixa escolher.
-- A posicao so serve a consulta; nada e gravado.

create or replace function public.onde_estou(lon double precision, lat double precision)
returns jsonb
language sql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
    with p as (select st_transform(st_setsrid(st_makepoint(lon, lat), 4326), 3857) as g)
    select jsonb_build_object(
        'municipios', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'cd_mun', m.cd_mun, 'nm_mun', m.nm_mun, 'uf', m.sigla_uf,
                       'nucleo', m.nucleo, 'nome_nucleo', m.nome_nucleo)
                   order by m.nucleo)
              from vertentes.municipios_malha_2025 m, p
             where m.selecionado = 'Sim' and m.geom && p.g and st_intersects(m.geom, p.g)), '[]'::jsonb),
        'imoveis', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'id', i.fid,
                       'cod_imovel', (select c.cod_imovel from vertentes.imovel_codigo c where c.fid = i.fid),
                       'area_ha', round((st_area(st_transform(i.geom, 4326)::geography) / 1e4)::numeric, 1),
                       'status', i.ind_status)
                   order by st_area(i.geom))
              from vertentes.car_imovel_2026_10 i, p
             where i.selecionado = 'Sim' and i.geom && p.g and st_intersects(i.geom, p.g)), '[]'::jsonb)
    );
$fn$;

revoke all on function public.onde_estou(double precision, double precision) from public, anon;
grant execute on function public.onde_estou(double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
