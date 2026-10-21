-- Ajustes de 16/10/2026.

-- Com o nucleo selecionado, o CAR do nucleo 3 inteiro leva ate 4 s por tile no zoom 7.
-- O limite padrao do Supabase para quem tem login e 8 s.
alter role authenticated set statement_timeout = '15s';

-- Cursos d'agua da ANA saem do mapa: repetem a drenagem da BC250. Continuam na base oficial.
delete from vertentes.camadas where camada = 'curso_dagua_ana_bho6';
drop table if exists vertentes.curso_dagua_ana_bho6;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
