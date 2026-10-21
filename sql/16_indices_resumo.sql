-- Indices de cobertura para o resumo das camadas pesadas: o banco responde so pelo indice,
-- sem ler a geometria. O passivo do nucleo 2 inteiro levava 21 s, acima do limite de 15 s.
create index if not exists car_passivo_resumo on vertentes.car_passivo_2026_06 (nucleo) include (selecionado, classe, ha_no_nucleo);
create index if not exists car_imovel_resumo on vertentes.car_imovel_2026_06 (nucleo) include (selecionado, mod_fiscal, ha_no_nucleo);
create index if not exists sigef_privado_resumo on vertentes.sigef_privado (nucleo) include (selecionado, ha_no_nucleo);
create index if not exists prodes_cerrado_anual_resumo on vertentes.prodes_cerrado_anual_v20260717 (nucleo) include (selecionado, year, ha_no_nucleo);
create index if not exists prodes_cerrado_acum_resumo on vertentes.prodes_cerrado_acumulado_v20260717 (nucleo) include (selecionado, ha_no_nucleo);
create index if not exists prodes_caatinga_anual_resumo on vertentes.prodes_caatinga_anual_v20260805 (nucleo) include (selecionado, year, ha_no_nucleo);
create index if not exists drenagem_resumo on vertentes.drenagem_bc250_2025 (nucleo) include (selecionado, nome, km_no_nucleo);
vacuum analyze vertentes.car_passivo_2026_06;
vacuum analyze vertentes.car_imovel_2026_06;
vacuum analyze vertentes.sigef_privado;
vacuum analyze vertentes.prodes_cerrado_anual_v20260717;
vacuum analyze vertentes.prodes_cerrado_acumulado_v20260717;
vacuum analyze vertentes.prodes_caatinga_anual_v20260805;
vacuum analyze vertentes.drenagem_bc250_2025;
