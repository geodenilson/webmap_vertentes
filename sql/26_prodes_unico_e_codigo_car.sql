-- 30/10/2026, pedido do Denilson.
-- 1. PRODES em duas camadas, com os tres biomas juntos: acumulado (desmatado ate 2000) e
--    anual (2002 a 2025). As seis tabelas por bioma continuam no banco, fora do catalogo.
--    Rodar de novo sempre que o _02 subir um PRODES novo.
-- 2. Codigo do imovel do CAR para a janela de consulta. O codigo nao vai no tile: o mapa
--    pede o codigo do imovel clicado, um por vez.

-- 1 -------------------------------------------------------------------------
drop table if exists vertentes.prodes_acumulado;
create table vertentes.prodes_acumulado as
select row_number() over ()::integer as fid, geom, bioma, class_name, year, nucleo, nome_nucleo, selecionado, ha_no_nucleo
  from (
    select geom, 'Cerrado'::text as bioma, class_name, year, nucleo, nome_nucleo, selecionado, ha_no_nucleo
      from vertentes.prodes_cerrado_acumulado_v20260717
    union all
    select geom, 'Caatinga', class_name, year, nucleo, nome_nucleo, selecionado, ha_no_nucleo
      from vertentes.prodes_caatinga_acumulado_v20260805
    union all
    select geom, 'Pantanal', class_name, year, nucleo, nome_nucleo, selecionado, ha_no_nucleo
      from vertentes.prodes_pantanal_acumulado_v20260717
  ) t;

drop table if exists vertentes.prodes_anual;
create table vertentes.prodes_anual as
select row_number() over ()::integer as fid, geom, bioma, year, image_date, nucleo, nome_nucleo, selecionado, ha_no_nucleo
  from (
    select geom, 'Cerrado'::text as bioma, year, image_date, nucleo, nome_nucleo, selecionado, ha_no_nucleo
      from vertentes.prodes_cerrado_anual_v20260717
    union all
    select geom, 'Caatinga', year, image_date, nucleo, nome_nucleo, selecionado, ha_no_nucleo
      from vertentes.prodes_caatinga_anual_v20260805
    union all
    select geom, 'Pantanal', year, image_date, nucleo, nome_nucleo, selecionado, ha_no_nucleo
      from vertentes.prodes_pantanal_anual_v20260717
  ) t;

alter table vertentes.prodes_acumulado add primary key (fid);
alter table vertentes.prodes_anual add primary key (fid);
create index on vertentes.prodes_acumulado using gist (geom);
create index on vertentes.prodes_anual using gist (geom);
create index on vertentes.prodes_acumulado (nucleo);
create index on vertentes.prodes_anual (nucleo);
alter table vertentes.prodes_acumulado enable row level security;
alter table vertentes.prodes_anual enable row level security;
analyze vertentes.prodes_acumulado;
analyze vertentes.prodes_anual;

insert into vertentes.camadas
    (camada, titulo, tema, geometria, registros, versao, fonte, descricao, zoom_minimo, tolerancia_m,
     base, vira_ponto, campos_ponto, recorta_municipio)
select 'prodes_acumulado', 'prodes_acumulado', null, 'MULTIPOLYGON', (select count(*) from vertentes.prodes_acumulado),
       'v20260805', 'INPE, TerraBrasilis, PRODES Cerrado e Pantanal v20260717, Caatinga v20260805',
       'Desmatamento acumulado até 2000 (máscara do PRODES), Cerrado, Caatinga e Pantanal juntos.',
       0, 5, c.base, true, array[]::text[], true
  from vertentes.camadas c where c.camada = 'prodes_cerrado_acumulado_v20260717'
on conflict (camada) do update set registros = excluded.registros, versao = excluded.versao,
    fonte = excluded.fonte, descricao = excluded.descricao, carregada_em = now();

insert into vertentes.camadas
    (camada, titulo, tema, geometria, registros, versao, fonte, descricao, zoom_minimo, tolerancia_m,
     base, vira_ponto, campos_ponto, recorta_municipio)
select 'prodes_anual', 'prodes_anual', null, 'MULTIPOLYGON', (select count(*) from vertentes.prodes_anual),
       'v20260805', 'INPE, TerraBrasilis, PRODES Cerrado e Pantanal v20260717, Caatinga v20260805',
       'Desmatamento anual de 2002 a 2025, Cerrado, Caatinga e Pantanal juntos.',
       9, 5, c.base, true, array['year'], true
  from vertentes.camadas c where c.camada = 'prodes_cerrado_anual_v20260717'
on conflict (camada) do update set registros = excluded.registros, versao = excluded.versao,
    fonte = excluded.fonte, descricao = excluded.descricao, carregada_em = now();

-- Presenca: a uniao da presenca das camadas por bioma.
delete from vertentes.presenca where camada in ('prodes_acumulado', 'prodes_anual');
insert into vertentes.presenca (camada, nucleo, cd_mun)
select distinct 'prodes_acumulado', nucleo, cd_mun from vertentes.presenca
 where camada in ('prodes_cerrado_acumulado_v20260717', 'prodes_caatinga_acumulado_v20260805',
                  'prodes_pantanal_acumulado_v20260717');
insert into vertentes.presenca (camada, nucleo, cd_mun)
select distinct 'prodes_anual', nucleo, cd_mun from vertentes.presenca
 where camada in ('prodes_cerrado_anual_v20260717', 'prodes_caatinga_anual_v20260805',
                  'prodes_pantanal_anual_v20260717');

-- As seis por bioma saem do catalogo e da presenca (as tabelas ficam).
delete from vertentes.presenca where camada like 'prodes\_%\_v2026%';
delete from vertentes.camadas where camada like 'prodes\_%\_v2026%';

-- 2 -------------------------------------------------------------------------
create or replace function public.codigo_imovel(id integer)
returns text
language sql
stable
security definer
set search_path = vertentes, pg_temp
as $fn$
    select c.cod_imovel from vertentes.imovel_codigo c where c.fid = codigo_imovel.id;
$fn$;

revoke all on function public.codigo_imovel(integer) from public, anon;
grant execute on function public.codigo_imovel(integer) to authenticated;

notify pgrst, 'reload schema';
