-- 16/10/2026.
-- 1. Com um municipio escolhido, a camada de nucleos deixa de ser recortada: o limite do
--    nucleo fica inteiro e o municipio aparece com a cor dele. Recortada, ela desenhava a
--    divisa do municipio com a cor e a espessura do nucleo, e a borda do nucleo sumia.
-- 2. Presenca: quais camadas tem alguma feicao em cada nucleo e em cada municipio. O painel
--    mostra so essas. A conta e feita uma vez e guardada em vertentes.presenca.
--    Para refazer quando a base mudar:  select vertentes.recalcular_presenca();

-- 1 -------------------------------------------------------------------------
-- A funcao tile e a do sql/12 com uma linha a mais: a camada de nucleos nao entra no recorte
-- por municipio. Em vez de repetir o corpo inteiro, a regra entra pelo catalogo.
alter table vertentes.camadas add column if not exists recorta_municipio boolean not null default true;
update vertentes.camadas set recorta_municipio = (camada <> 'nucleos_malha_2025');

-- 2 -------------------------------------------------------------------------
create table if not exists vertentes.presenca (
    camada  text not null,
    nucleo  integer not null,
    cd_mun  text,
    unique (camada, nucleo, cd_mun)
);
alter table vertentes.presenca enable row level security;

create or replace function vertentes.recalcular_presenca()
returns integer
language plpgsql
set search_path = extensions, vertentes, pg_temp
as $fn$
declare
    c       record;
    total   integer;
begin
    truncate vertentes.presenca;
    for c in
        select k.camada
          from vertentes.camadas k
         where exists (select 1 from pg_attribute a
                        where a.attrelid = format('vertentes.%I', k.camada)::regclass
                          and a.attname = 'nucleo' and not a.attisdropped)
    loop
        -- Por nucleo: basta o campo.
        execute format(
            'insert into vertentes.presenca (camada, nucleo, cd_mun)
             select distinct %L, t.nucleo, null from vertentes.%I t where t.selecionado = ''Sim''',
            c.camada, c.camada);
        -- Por municipio: a feicao precisa entrar no municipio, e nao so encostar na divisa.
        if c.camada = 'municipios_malha_2025' then
            insert into vertentes.presenca (camada, nucleo, cd_mun)
            select distinct 'municipios_malha_2025', m.nucleo, m.cd_mun
              from vertentes.municipios_malha_2025 m where m.selecionado = 'Sim';
        else
            execute format(
                'insert into vertentes.presenca (camada, nucleo, cd_mun)
                 select %L, m.nucleo, m.cd_mun
                   from vertentes.municipios_malha_2025 m
                  where m.selecionado = ''Sim''
                    and exists (select 1 from vertentes.%I t
                                 where t.nucleo = m.nucleo
                                   and t.geom && m.geom
                                   and st_intersects(m.geom, t.geom)
                                   and not st_touches(m.geom, t.geom))',
                c.camada, c.camada);
        end if;
    end loop;
    select count(*) into total from vertentes.presenca;
    return total;
end
$fn$;

create or replace function public.camadas_presentes(nucleo integer, municipio text default null)
returns setof text
language sql
stable
security definer
set search_path = vertentes, pg_temp
as $fn$
    select p.camada
      from vertentes.presenca p
     where p.nucleo = camadas_presentes.nucleo
       and ((camadas_presentes.municipio is null and p.cd_mun is null)
            or p.cd_mun = camadas_presentes.municipio);
$fn$;

revoke all on function public.camadas_presentes(integer, text) from public, anon;
grant execute on function public.camadas_presentes(integer, text) to authenticated;

notify pgrst, 'reload schema';
