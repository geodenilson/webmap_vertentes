-- Vegetacao do nivel do imovel em COG, em lugar de poligonos no banco (23/10/2026).
-- Os 13 milhoes de poligonos levariam mais de 15 horas para subir. O desenho vem do COG
-- de cada cena (bucket planet, pasta vegetacao/), e os hectares por imovel foram somados
-- fora do banco (_07_vegetacao.py) e ficam nesta tabela.

drop table if exists vertentes.vegetacao;

create table if not exists vertentes.imovel_vegetacao (
    fid     integer primary key,
    veg_ha  numeric not null
);
alter table vertentes.imovel_vegetacao enable row level security;

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

    return jsonb_build_object(
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
        'veg_ha_imovel', coalesce((select round(v.veg_ha, 1) from vertentes.imovel_vegetacao v
                                    where v.fid = im.fid), 0),
        'passivo', coalesce((select jsonb_object_agg(classe, ha)
                               from (select p.classe,
                                            round(sum(st_area(st_transform(st_intersection(p.geom, im.geom), 4326)::geography))::numeric / 1e4, 1) as ha
                                       from vertentes.car_passivo_2026_06 p
                                      where p.geom && im.geom and st_intersects(p.geom, im.geom)
                                      group by p.classe) q), '{}'::jsonb),
        'cenas', coalesce((select jsonb_agg(jsonb_build_object('cena', c.cena, 'arquivo', c.arquivo, 'data', c.data)
                                            order by c.cena)
                             from vertentes.planet_cenas c where c.geom && faixa), '[]'::jsonb)
    );
end
$fn$;

revoke all on function public.imovel_webmap(integer) from public, anon;
grant execute on function public.imovel_webmap(integer) to authenticated;

notify pgrst, 'reload schema';
