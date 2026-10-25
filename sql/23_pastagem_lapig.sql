-- Pastagem por vigor do LAPIG, 2024 (25/10/2026). Rodar depois de subir a camada com o
-- _02_subir_supabase.py. Como o PRODES anual: com milhoes de poligonos, so aparece com um
-- nucleo escolhido, o poligono pequeno para a escala vira ponto levando so a classe, e a
-- camada e recortada por municipio e por imovel como os demais temas.

update vertentes.camadas
   set zoom_minimo = 9,
       vira_ponto = true,
       campos_ponto = array['cls_vigor'],
       recorta_municipio = true
 where camada = 'pastagem_vigor_lapig_2024';

-- Indice de cobertura para o resumo da pagina de informacoes (como o sql/16).
create index if not exists pastagem_vigor_lapig_2024_resumo
    on vertentes.pastagem_vigor_lapig_2024 (nucleo) include (cls_vigor, ha_no_nucleo);
vacuum analyze vertentes.pastagem_vigor_lapig_2024;

select vertentes.recalcular_presenca();
