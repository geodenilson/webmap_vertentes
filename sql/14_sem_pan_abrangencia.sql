-- 16/10/2026. A area de abrangencia dos PANs sai do mapa: fica so a de areas estrategicas.
-- Continua na base oficial.
delete from vertentes.presenca where camada = 'pan_abrangencia_icmbio_2024_05';
delete from vertentes.camadas where camada = 'pan_abrangencia_icmbio_2024_05';
drop table if exists vertentes.pan_abrangencia_icmbio_2024_05;
notify pgrst, 'reload schema';
