// Como cada camada aparece no mapa, na legenda e no PDF.
// A ordem da lista e a ordem de desenho: a primeira fica embaixo.
// Cores da colecao de mapas (Demandas/004) onde a colecao ja define a camada.
// contexto: camada sem campo de nucleo, que nao e filtrada quando se escolhe um nucleo.
// filtro: filtro padrao aplicado no mapa, em expressao do MapLibre.

import { CAMADAS_SELECAO } from "./selecao.js";

export const TEMAS = [
  ["limites", "Limites"],
  ["hidro", "Água e governança"],
  ["conservacao", "Conservação"],
  ["fundiario", "CAR e fundiário"],
  ["povos", "Povos e comunidades"],
  ["pressao", "Pressão e fiscalização"],
  ["fisico", "Meio físico e vegetação"],
  ["infra", "Infraestrutura"],
  ["selecao", "Seleção de municípios"],
];

const outro = "#9a9488";

function categorias(campo, pares, resto = outro) {
  const expr = ["match", ["to-string", ["get", campo]]];
  for (const [valor, cor] of pares) expr.push(valor, cor);
  expr.push(resto);
  return expr;
}

const PASSIVO = [["APP", "#2f6b8f"], ["RL", "#c1440e"], ["UR", "#5b4a8a"]];
const PRIORIDADE = [["Alta", "#eae4f0"], ["Muito Alta", "#c9bade"], ["Extremamente Alta", "#9b7fc0"]];
const COMITE = [
  ["Com cobrança", "#0f3d1c"],
  ["Com instrumentos da PNRH", "#1f5e2e"],
  ["Em funcionamento", "#4a7540"],
  ["Em processo de instalação", "#d9a13b"],
  ["Criado, mas não instalado", "#c1440e"],
];
const MODULO = [
  ["até 4 módulos fiscais", "#e7dfc9"],
  ["acima de 4 a menos de 10", "#c9b48a"],
  ["de 10 a 15", "#a07f4d"],
  ["acima de 15", "#6e4f24"],
];
const MODULO_EXPR = [
  "step", ["to-number", ["get", "mod_fiscal"], 0],
  MODULO[0][1], 4.0000001, MODULO[1][1], 10, MODULO[2][1], 15.0000001, MODULO[3][1],
];
const CNFP = [
  ["PROTECAO INTEGRAL", "#1f8d49"],
  ["USO SUSTENTAVEL", "#8fbf8c"],
  ["USO MILITAR", "#7d7a70"],
  ["SEM DESTINACAO", "#d9a13b"],
  ["OUTROS USOS", "#c9c3b5"],
];
const FASE_QUILOMBO = [
  ["RTID", "#e9a07a"], ["DECRETO", "#d06a3a"], ["CCDRU", "#c1440e"], ["TITULO PARCIAL", "#7c2b08"],
];
// Vigor da pastagem: as mesmas cores da colecao de mapas (Demandas/004).
const VIGOR_PASTAGEM = [["1", "#a61c00"], ["2", "#fdae61"], ["3", "#2d7bb6"]];
const ROTULO_VIGOR = { 1: "Vigor baixo", 2: "Vigor médio", 3: "Vigor alto" };
const ANO_PRODES = [
  "interpolate", ["linear"], ["to-number", ["get", "year"], 2002],
  2002, "#f6d8a8", 2012, "#ec9a52", 2019, "#d6512a", 2025, "#8f1d10",
];

function poligono(cor, borda, opacidade = 0.6, larguraBorda = 0.6) {
  return {
    tipo: "fill",
    pintura: { "fill-color": cor, "fill-opacity": opacidade },
    contorno: { "line-color": borda, "line-width": larguraBorda },
  };
}
function linha(cor, largura = 1, tracejado = null) {
  const pintura = { "line-color": cor, "line-width": largura };
  if (tracejado) pintura["line-dasharray"] = tracejado;
  return { tipo: "line", pintura };
}
function ponto(cor, raio = 3.5) {
  return {
    tipo: "circle",
    pintura: {
      "circle-color": cor, "circle-radius": raio,
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8,
    },
  };
}

export const CAMADAS = [
  // Meio fisico e vegetacao, no fundo.
  { id: "pedologia_ibge_2021", titulo: "Pedologia, IBGE 1:250.000", tema: "fisico",
    ...poligono("#e4d6bf", "#a8916b", 0.35, 0.3), legenda: [["Unidade de solo", "#e4d6bf"]],
    nota: "A base chegou só com a geometria, sem a classe." },
  { id: "geologia_ibge_2021", titulo: "Geologia, IBGE 1:250.000", tema: "fisico",
    ...poligono("#e0d2e6", "#9a83a6", 0.35, 0.3), legenda: [["Unidade geológica", "#e0d2e6"]],
    nota: "A base chegou só com a geometria, sem a classe." },
  { id: "geomorfologia_ibge_2021", titulo: "Geomorfologia, IBGE 1:250.000", tema: "fisico",
    ...poligono("#dfe3cf", "#8f9a73", 0.35, 0.3), legenda: [["Unidade geomorfológica", "#dfe3cf"]],
    nota: "A base chegou só com a geometria, sem a classe." },
  { id: "vegetacao_ibge_2026", titulo: "Vegetação pretérita, IBGE", tema: "fisico",
    ...poligono("#cfe0c3", "#6f8f5d", 0.4, 0.3), legenda: [["Vegetação que existiria sem antropização", "#cfe0c3"]],
    titulo_popup: "legenda_1" },

  // Selecao de municipios: um mapa por criterio, valor bruto em classes (gerado por
  // _08_selecao_municipios.py). Fica embaixo dos temas de feicao.
  ...CAMADAS_SELECAO,

  // Agua e governanca.
  { id: "regioes_hidrograficas", titulo: "Regiões hidrográficas, ANA", tema: "hidro",
    ...linha("#3d6f93", 1.6, [4, 2]), legenda: [["Limite de região hidrográfica", "#3d6f93", "linha"]] },
  { id: "unidades_gestao_hidrica_ana_2014", titulo: "Unidades de gestão hídrica, ANA", tema: "hidro",
    ...poligono("#dbe9f1", "#6d93ab", 0.35, 0.6), legenda: [["Unidade estadual de gestão", "#dbe9f1"]],
    titulo_popup: "uhe_nm", rotulo: "uhe_nm" },
  { id: "ottobacia_n04_ana_bho6", titulo: "Ottobacias nível 4, ANA", tema: "hidro",
    ...linha("#5d87a6", 0.8), legenda: [["Limite de ottobacia", "#5d87a6", "linha"]] },
  { id: "bacias_otto_n02_nucleo_2", titulo: "Bacias do núcleo 2", tema: "hidro",
    ...poligono("#b8d4e6", "#2f6b8f", 0.35, 1), legenda: [["Bacia, nome do rio de maior extensão", "#b8d4e6"]],
    titulo_popup: "nome_bacia", rotulo: "nome_bacia" },
  { id: "comites_estaduais", titulo: "Comitês de bacia estaduais", tema: "hidro",
    tipo: "fill",
    pintura: { "fill-color": categorias("nivel", COMITE), "fill-opacity": 0.25 },
    contorno: { "line-color": categorias("nivel", COMITE), "line-width": 1.8 },
    legenda: COMITE, titulo_popup: "nmcbe", rotulo: "nmcbe" },
  { id: "comites_interestaduais", titulo: "Comitês de bacia interestaduais", tema: "hidro",
    tipo: "fill",
    pintura: { "fill-color": "#6a3d9a", "fill-opacity": 0.15 },
    contorno: { "line-color": "#6a3d9a", "line-width": 2, "line-dasharray": [5, 2] },
    legenda: [["Comitê interestadual", "#6a3d9a"]], titulo_popup: "nmcbf", rotulo: "nmcbf" },
  { id: "massa_dagua_bc250_2025", titulo: "Massas d'água, BC250", tema: "hidro",
    ...poligono("#8fc1e3", "#4f8db8", 0.9, 0.4), legenda: [["Represa, açude, lago e lagoa", "#8fc1e3"]] },
  { id: "drenagem_bc250_2025", titulo: "Drenagem, BC250", tema: "hidro",
    ...linha("#4f8db8", 0.9), legenda: [["Rio com nome", "#4f8db8", "linha"]], titulo_popup: "nome", rotulo: "nome",
    filtro: ["all", ["has", "nome"], ["!=", ["get", "nome"], ""]],
    nota: "Filtro padrão: só os trechos com nome." },

  // Conservacao.
  { id: "areas_prioritarias_cerrado_pantanal_2018", titulo: "Áreas prioritárias, Cerrado e Pantanal", tema: "conservacao",
    tipo: "fill",
    pintura: { "fill-color": categorias("import_bio", PRIORIDADE), "fill-opacity": 0.75 },
    contorno: { "line-color": "#8d80ab", "line-width": 0.5 },
    legenda: PRIORIDADE.map(([r, c]) => [`Importância ${r.toLowerCase()}`, c]), titulo_popup: "nome" },
  { id: "areas_prioritarias_caatinga_2018", titulo: "Áreas prioritárias, Caatinga", tema: "conservacao",
    tipo: "fill",
    pintura: { "fill-color": categorias("import_bio", PRIORIDADE), "fill-opacity": 0.75 },
    contorno: { "line-color": "#8d80ab", "line-width": 0.5 },
    legenda: PRIORIDADE.map(([r, c]) => [`Importância ${r.toLowerCase()}`, c]), titulo_popup: "nome_area" },
  { id: "reservas_biosfera_mma", titulo: "Reservas da biosfera", tema: "conservacao",
    ...poligono("#f0e6b8", "#a89236", 0.45, 1), legenda: [["Reserva da biosfera", "#f0e6b8"]],
    nota: "O arquivo não traz o nome da reserva." },
  { id: "pan_areas_estrategicas_icmbio_2024_05", titulo: "PAN, áreas estratégicas", tema: "conservacao",
    ...poligono("#c7b3e0", "#6b4b94", 0.6, 0.6), legenda: [["Área estratégica de PAN", "#c7b3e0"]],
    titulo_popup: "nmarea", rotulo: "nmarea" },
  { id: "florestas_publicas_cnfp_2024_ret20250717", titulo: "Florestas públicas, CNFP", tema: "conservacao",
    tipo: "fill",
    pintura: { "fill-color": categorias("protecao", CNFP), "fill-opacity": 0.55 },
    contorno: { "line-color": "#4a4740", "line-width": 0.4 },
    legenda: CNFP.map(([r, c]) => [r.charAt(0) + r.slice(1).toLowerCase(), c]), titulo_popup: "nome" },
  { id: "unidades_conservacao_cnuc_2026_09", titulo: "Unidades de conservação, CNUC", tema: "conservacao",
    tipo: "fill",
    pintura: {
      "fill-color": [
        "case",
        ["==", ["get", "categoria"], "Reserva Particular do Patrimônio Natural"], "#c1440e",
        ["==", ["get", "grupo"], "Proteção Integral"], "#1f8d49",
        "#8fbf8c",
      ],
      "fill-opacity": 0.7,
    },
    contorno: { "line-color": "#3f6b3a", "line-width": 0.6 },
    legenda: [["Proteção integral", "#1f8d49"], ["Uso sustentável", "#8fbf8c"], ["RPPN", "#c1440e"]],
    titulo_popup: "nome_uc", rotulo: "nome_uc" },
  { id: "municipios_prioritarios_cerrado", titulo: "Municípios prioritários do Cerrado, MMA", tema: "conservacao",
    ...poligono("#f3c9b3", "#c1440e", 0.35, 1.2), legenda: [["Município prioritário", "#f3c9b3"]],
    titulo_popup: "nm_municip", rotulo: "nm_municip" },

  // CAR e fundiario.
  { id: "sigef_publico", titulo: "SIGEF público", tema: "fundiario",
    ...poligono("#d9e4ec", "#6d8aa0", 0.5, 0.4), legenda: [["Imóvel público certificado", "#d9e4ec"]] },
  { id: "snci_publico", titulo: "SNCI público", tema: "fundiario",
    ...poligono("#d9e4ec", "#6d8aa0", 0.5, 0.4), legenda: [["Imóvel público, certificação antiga", "#d9e4ec"]] },
  { id: "sigef_privado", titulo: "SIGEF privado", tema: "fundiario",
    ...poligono("#efe7d3", "#9c8c66", 0.45, 0.3), legenda: [["Imóvel privado certificado", "#efe7d3"]] },
  { id: "snci_privado", titulo: "SNCI privado", tema: "fundiario",
    ...poligono("#efe7d3", "#9c8c66", 0.45, 0.3), legenda: [["Imóvel privado, certificação antiga", "#efe7d3"]] },
  { id: "car_imovel_2026_06", titulo: "Imóveis do CAR, junho de 2026", tema: "fundiario",
    tipo: "fill",
    pintura: { "fill-color": MODULO_EXPR, "fill-opacity": 0.55 },
    contorno: { "line-color": "#6e5a3a", "line-width": 0.3 },
    legenda: MODULO, titulo_popup: "municipio" },
  { id: "car_passivo_2026_06", titulo: "Passivo do CAR, junho de 2026", tema: "fundiario",
    tipo: "fill",
    pintura: { "fill-color": categorias("classe", PASSIVO), "fill-opacity": 0.85 },
    contorno: { "line-color": categorias("classe", PASSIVO), "line-width": 0.5 },
    legenda: [["APP sem vegetação", PASSIVO[0][1]], ["Reserva legal sem vegetação", PASSIVO[1][1]], ["Uso restrito sem vegetação", PASSIVO[2][1]]],
    titulo_popup: "classe" },
  { id: "assentamentos_federais", titulo: "Assentamentos federais, INCRA", tema: "fundiario",
    ...poligono("#2f6b8f", "#143044", 0.45, 0.8), legenda: [["Assentamento federal", "#2f6b8f"]],
    titulo_popup: "nome_proje", rotulo: "nome_proje" },
  { id: "assentamentos_reconhecidos", titulo: "Assentamentos reconhecidos, INCRA", tema: "fundiario",
    ...poligono("#6f9fbd", "#143044", 0.45, 0.8), legenda: [["Assentamento reconhecido", "#6f9fbd"]],
    titulo_popup: "nome_proje", rotulo: "nome_proje" },

  // Povos e comunidades.
  { id: "terras_indigenas", titulo: "Terras indígenas, FUNAI", tema: "povos",
    ...poligono("#8a5a00", "#5a3b00", 0.6, 1), legenda: [["Terra indígena", "#8a5a00"]],
    titulo_popup: "terrai_nom", rotulo: "terrai_nom" },
  { id: "quilombolas", titulo: "Territórios quilombolas, INCRA", tema: "povos",
    tipo: "fill",
    pintura: { "fill-color": categorias("fase", FASE_QUILOMBO), "fill-opacity": 0.75 },
    contorno: { "line-color": "#7c2b08", "line-width": 0.8 },
    legenda: FASE_QUILOMBO.map(([r, c]) => [r === "TITULO PARCIAL" ? "Título parcial" : r, c]),
    titulo_popup: "nm_comunid", rotulo: "nm_comunid" },

  // Pressao e fiscalizacao.
  { id: "prodes_cerrado_acumulado_v20260717", titulo: "PRODES Cerrado, desmatado até 2000", tema: "pressao",
    ...poligono("#e8cfb6", "#b38b63", 0.55, 0.2), legenda: [["Desmatamento acumulado até 2000", "#e8cfb6"]] },
  { id: "prodes_caatinga_acumulado_v20260805", titulo: "PRODES Caatinga, acumulado", tema: "pressao",
    ...poligono("#e8cfb6", "#b38b63", 0.55, 0.2), legenda: [["Desmatamento acumulado", "#e8cfb6"]] },
  { id: "prodes_pantanal_acumulado_v20260717", titulo: "PRODES Pantanal, acumulado", tema: "pressao",
    ...poligono("#e8cfb6", "#b38b63", 0.55, 0.2), legenda: [["Desmatamento acumulado", "#e8cfb6"]] },
  { id: "prodes_cerrado_anual_v20260717", titulo: "PRODES Cerrado, desmatamento anual", tema: "pressao",
    tipo: "fill", pintura: { "fill-color": ANO_PRODES, "fill-opacity": 0.85 },
    contorno: { "line-color": ANO_PRODES, "line-width": 0.5 },
    legenda: [["2002", "#f6d8a8"], ["2012", "#ec9a52"], ["2019", "#d6512a"], ["2025", "#8f1d10"]],
    titulo_popup: "year" },
  { id: "prodes_caatinga_anual_v20260805", titulo: "PRODES Caatinga, desmatamento anual", tema: "pressao",
    tipo: "fill", pintura: { "fill-color": ANO_PRODES, "fill-opacity": 0.85 },
    contorno: { "line-color": ANO_PRODES, "line-width": 0.5 },
    legenda: [["2002", "#f6d8a8"], ["2012", "#ec9a52"], ["2019", "#d6512a"], ["2025", "#8f1d10"]],
    titulo_popup: "year" },
  { id: "prodes_pantanal_anual_v20260717", titulo: "PRODES Pantanal, desmatamento anual", tema: "pressao",
    tipo: "fill", pintura: { "fill-color": ANO_PRODES, "fill-opacity": 0.85 },
    contorno: { "line-color": ANO_PRODES, "line-width": 0.5 },
    legenda: [["2002", "#f6d8a8"], ["2012", "#ec9a52"], ["2019", "#d6512a"], ["2025", "#8f1d10"]],
    titulo_popup: "year" },
  { id: "pastagem_vigor_lapig_2024", titulo: "Pastagem por vigor, LAPIG 2024", tema: "pressao",
    tipo: "fill", zoomMinimo: 7,
    pintura: { "fill-color": categorias("cls_vigor", VIGOR_PASTAGEM), "fill-opacity": 0.75 },
    contorno: { "line-color": categorias("cls_vigor", VIGOR_PASTAGEM), "line-width": 0.5 },
    legenda: VIGOR_PASTAGEM.map(([v, c]) => [ROTULO_VIGOR[v], c]), titulo_popup: "vigor",
    nota: "Só o bioma Cerrado. Vigor baixo indica degradação severa." },
  { id: "asv_sinaflor", titulo: "Autorizações de supressão, Sinaflor", tema: "pressao",
    ...poligono("#f2b36b", "#a8621a", 0.6, 0.6), legenda: [["Supressão autorizada", "#f2b36b"]],
    titulo_popup: "status_aut" },
  { id: "embargos_ibama", titulo: "Embargos, Ibama", tema: "pressao",
    ...poligono("#e3342f", "#8f1d10", 0.6, 0.8), legenda: [["Área embargada pelo Ibama", "#e3342f"]] },
  { id: "embargos_icmbio_2026_10", titulo: "Embargos, ICMBio", tema: "pressao",
    ...poligono("#b51d6a", "#6b0f3d", 0.6, 0.8), legenda: [["Área embargada pelo ICMBio", "#b51d6a"]],
    titulo_popup: "nome_uc" },
  { id: "autos_infracao_ibama", titulo: "Autos de infração, Ibama", tema: "pressao",
    ...ponto("#e3342f"), legenda: [["Auto de infração do Ibama", "#e3342f", "ponto"]],
    titulo_popup: "des_infracao" },
  { id: "autos_infracao_icmbio_2026_10", titulo: "Autos de infração, ICMBio", tema: "pressao",
    ...ponto("#b51d6a"), legenda: [["Auto de infração do ICMBio", "#b51d6a", "ponto"]],
    titulo_popup: "tipo_infra" },

  // Infraestrutura.
  { id: "areas_urbanizadas_ibge_2022_ed2026_08", titulo: "Áreas urbanizadas, IBGE", tema: "infra",
    ...poligono("#b8b2a7", "#7d776c", 0.7, 0.3), legenda: [["Área urbanizada", "#b8b2a7"]], titulo_popup: "tipo" },
  { id: "rodovias_dnit_snv_2026_01", titulo: "Rodovias, DNIT", tema: "infra",
    tipo: "line",
    pintura: {
      "line-color": categorias("ds_superfi", [["PAV", "#d1495b"], ["PLA", "#e8a33d"], ["N_PAV", "#a8957a"]]),
      "line-width": 1.4,
    },
    legenda: [["Pavimentada", "#d1495b", "linha"], ["Em pavimentação ou planejada", "#e8a33d", "linha"], ["Não pavimentada", "#a8957a", "linha"]],
    titulo_popup: "vl_br" },
  { id: "ferrovias_bc250_2025", titulo: "Ferrovias, BC250", tema: "infra",
    ...linha("#3a3632", 1.4, [2, 1]), legenda: [["Ferrovia", "#3a3632", "linha"]], titulo_popup: "nome" },

  // Limites, por cima de tudo.
  { id: "biomas_ibge_2025", titulo: "Biomas, IBGE", tema: "limites", contexto: true,
    ...linha("#6f6a60", 1.2, [6, 3]), legenda: [["Limite de bioma", "#6f6a60", "linha"]], titulo_popup: "nm_bioma" },
  { id: "matopiba", titulo: "Matopiba, Embrapa", tema: "limites",
    ...linha("#a8621a", 1.6, [2, 2]), legenda: [["Limite do Matopiba", "#a8621a", "linha"]] },
  { id: "municipios_malha_2025", titulo: "Municípios, IBGE 2025", tema: "limites",
    ligada: true, tipo: "fill",
    pintura: { "fill-color": "#ffffff", "fill-opacity": 0 },
    contorno: { "line-color": "#9c937f", "line-width": 0.6 },
    legenda: [["Limite municipal", "#9c937f", "linha"]], titulo_popup: "nm_mun", rotulo: "nm_mun" },
  { id: "nucleos_malha_2025", titulo: "Núcleos do projeto", tema: "limites",
    ligada: true, tipo: "fill", preenchimentoEmbaixo: true,
    pintura: { "fill-color": "#d5e4cd", "fill-opacity": 0.25 },
    contorno: { "line-color": "#2f5e2a", "line-width": 2.2 },
    legenda: [["Limite do núcleo", "#2f5e2a", "linha"]],
    titulo_popup: "nome_nucleo" },
  { id: "limite_estadual_malha_2025", titulo: "Limite estadual", tema: "limites",
    ligada: true, contexto: true, ...linha("#2d2823", 1.3), legenda: [["Limite estadual", "#2d2823", "linha"]], titulo_popup: "nm_uf" },
  { id: "sedes_municipais_bc250_2025", titulo: "Sedes municipais", tema: "limites",
    ...ponto("#2b2b2b", 3), legenda: [["Sede municipal", "#2b2b2b", "ponto"]], titulo_popup: "nome",
    rotulo: "nome" },
];

// Pagina de informacoes do PDF: o campo que separa as classes no grafico e o campo que da
// o nome na lista dos maiores. Camada sem entrada aqui sai so com os totais.
// Nao ha nome de pessoa, CPF, CNPJ ou codigo de imovel: esses campos nem sobem para o banco.
export const RESUMO = {
  unidades_conservacao_cnuc_2026_09: { classe: "categoria", nome: "nome_uc" },
  areas_prioritarias_cerrado_pantanal_2018: { classe: "import_bio", nome: "nome" },
  areas_prioritarias_caatinga_2018: { classe: "import_bio", nome: "nome_area" },
  pan_areas_estrategicas_icmbio_2024_05: { classe: "nomepan", nome: "nmarea" },
  florestas_publicas_cnfp_2024_ret20250717: { classe: "protecao", nome: "nome" },
  municipios_prioritarios_cerrado: { nome: "nm_municip" },
  comites_estaduais: { classe: "nivel", nome: "nmcbe" },
  comites_interestaduais: { nome: "nmcbf" },
  unidades_gestao_hidrica_ana_2014: { nome: "uhe_nm" },
  bacias_otto_n02_nucleo_2: { nome: "nome_bacia" },
  massa_dagua_bc250_2025: { classe: "tipomassad", nome: "nome" },
  drenagem_bc250_2025: { nome: "nome" },
  car_imovel_2026_06: { classe: "mod_fiscal" },
  car_passivo_2026_06: { classe: "classe" },
  assentamentos_federais: { classe: "fase", nome: "nome_proje" },
  assentamentos_reconhecidos: { nome: "nome_proje" },
  terras_indigenas: { classe: "fase_ti", nome: "terrai_nom" },
  quilombolas: { classe: "fase", nome: "nm_comunid" },
  prodes_cerrado_anual_v20260717: { classe: "year" },
  prodes_caatinga_anual_v20260805: { classe: "year" },
  prodes_pantanal_anual_v20260717: { classe: "year" },
  pastagem_vigor_lapig_2024: { classe: "cls_vigor" },
  asv_sinaflor: { classe: "tipo_ativi" },
  embargos_ibama: { classe: "des_tipo_b" },
  embargos_icmbio_2026_10: { nome: "nome_uc" },
  autos_infracao_ibama: { classe: "tipo_infracao" },
  autos_infracao_icmbio_2026_10: { classe: "tipo_infra" },
  areas_urbanizadas_ibge_2022_ed2026_08: { classe: "tipo" },
  rodovias_dnit_snv_2026_01: { classe: "ds_superfi", nome: "vl_br" },
  ferrovias_bc250_2025: { nome: "nome" },
  vegetacao_ibge_2026: { classe: "legenda_1" },
  sedes_municipais_bc250_2025: { nome: "nome" },
  municipios_malha_2025: { nome: "nm_mun" },
  nucleos_malha_2025: { nome: "nome_nucleo" },
  biomas_ibge_2025: { classe: "nm_bioma" },
  limite_estadual_malha_2025: { classe: "sigla_uf" },
};

// Rotulo legivel para classes que no banco sao codigo.
export const ROTULO_CLASSE = {
  car_passivo_2026_06: { APP: "APP sem vegetação", RL: "Reserva legal sem vegetação", UR: "Uso restrito sem vegetação" },
  rodovias_dnit_snv_2026_01: { PAV: "Pavimentada", PLA: "Em pavimentação ou planejada", N_PAV: "Não pavimentada" },
  pastagem_vigor_lapig_2024: ROTULO_VIGOR,
};
