// Mapa coroplético de dois eixos, a partir de duas camadas do grupo Seleção de municípios.
// Cada município já traz todos os critérios no tile: as classes (tercis) saem no navegador,
// sem tile novo e sem ida ao banco. As paletas 3×3 vêm de sistemas validados para mapa
// científico (ColorBrewer, Crameri 2020, Joshua Stevens), com opções amigáveis a daltonismo.

import { CAMADAS_SELECAO } from "./selecao.js";

export const ID_BIVARIADO = "sel_bivariado";
export const COR_SEM_DADO = "#bdbdbd";
export const PALETA_PADRAO = "brewer-ouro-azul";

// cores[classe do eixo vertical][classe do eixo horizontal], 0 = baixo, 2 = alto.
// Empacotamento do pacote pals (Wright): a primeira terna é a linha de baixo (Y baixo,
// X crescendo à direita). No Stevens bluered isso dá ciano no vertical e laranja no horizontal.
export const PALETAS = [
  {
    id: "brewer-ouro-azul",
    nome: "ColorBrewer ouro × azul",
    grupo: "Amigáveis a daltonismo",
    daltonismo: true,
    fonte: "Cindy Brewer / ColorBrewer. Ouro no vertical, azul no horizontal. Amigável a daltonismo.",
    cores: [
      ["#f3f3f3", "#b4d3e1", "#509dc2"],
      ["#f3e6b3", "#b3b3b3", "#376387"],
      ["#f3b300", "#b36600", "#000000"],
    ],
  },
  {
    id: "crameri-oslo-lajolla",
    nome: "Crameri oslo × lajolla",
    grupo: "Amigáveis a daltonismo",
    daltonismo: true,
    fonte: "Crameri, Shephard & Heron 2020 (Nature Communications). oslo (azul) no vertical, lajolla (amarelo-marrom) no horizontal. Amigável a daltonismo.",
    cores: [
      ["#e7e3c2", "#de744f", "#603226"],
      ["#5881c1", "#ac7b96", "#5d5679"],
      ["#102941", "#884c46", "#462e35"],
    ],
  },
  {
    id: "biscale-azul-violeta",
    nome: "Azul × violeta",
    grupo: "Amigáveis a daltonismo",
    daltonismo: true,
    fonte: "biscale DkViolet2 (Prener). Azul no vertical, violeta no horizontal. Testada para daltonismo.",
    cores: [
      ["#d3d3d3", "#ba8890", "#9e3547"],
      ["#8aa6c2", "#7a6b84", "#682a41"],
      ["#4279b0", "#3a4e78", "#311e3b"],
    ],
  },
  {
    id: "stevens-ciano-laranja",
    nome: "Stevens ciano × laranja",
    grupo: "Clássicas",
    daltonismo: false,
    fonte: "Joshua Stevens. Ciano no vertical, laranja no horizontal. A mesma ideia do mapa de co-benefícios (Soto-Navarro et al. 2020).",
    cores: [
      ["#e8e8e8", "#e4acac", "#c85a5a"],
      ["#b0d5df", "#ad9ea5", "#985356"],
      ["#64acbe", "#627f8c", "#574249"],
    ],
  },
  {
    id: "stevens-rosa-azul",
    nome: "Stevens rosa × azul",
    grupo: "Clássicas",
    daltonismo: false,
    fonte: "Joshua Stevens. Rosa no vertical, azul no horizontal.",
    cores: [
      ["#e8e8e8", "#ace4e4", "#5ac8c8"],
      ["#dfb0d6", "#a5add3", "#5698b9"],
      ["#be64ac", "#8c62aa", "#3b4994"],
    ],
  },
  {
    id: "stevens-verde-azul",
    nome: "Stevens verde × azul",
    grupo: "Clássicas",
    daltonismo: false,
    fonte: "Joshua Stevens. Verde no vertical, azul no horizontal.",
    cores: [
      ["#e8e8e8", "#b5c0da", "#6c83b5"],
      ["#b8d6be", "#90b2b3", "#567994"],
      ["#73ae80", "#5a9178", "#2a5a5b"],
    ],
  },
  {
    id: "stevens-roxo-ouro",
    nome: "Stevens roxo × ouro",
    grupo: "Clássicas",
    daltonismo: false,
    fonte: "Joshua Stevens. Roxo no vertical, ouro no horizontal.",
    cores: [
      ["#e8e8e8", "#e4d9ac", "#c8b35a"],
      ["#cbb8d7", "#c8ada0", "#af8e53"],
      ["#9972af", "#976b82", "#804d36"],
    ],
  },
];

export const CORES = paletaPorId(PALETA_PADRAO).cores;

export function paletaPorId(id) {
  return PALETAS.find((p) => p.id === id) ?? PALETAS.find((p) => p.id === PALETA_PADRAO);
}

export function htmlOpcoesPaleta(atual) {
  const escolhida = paletaPorId(atual).id;
  const grupos = [];
  for (const p of PALETAS) {
    if (!grupos.includes(p.grupo)) grupos.push(p.grupo);
  }
  let html = "";
  for (const grupo of grupos) {
    html += `<optgroup label="${grupo}">`;
    for (const p of PALETAS.filter((item) => item.grupo === grupo)) {
      const sel = p.id === escolhida ? " selected" : "";
      html += `<option value="${p.id}"${sel}>${p.nome}</option>`;
    }
    html += "</optgroup>";
  }
  return html;
}

export function htmlAmostra(cores) {
  let html = "";
  for (let yi = 2; yi >= 0; yi -= 1) {
    for (let xi = 0; xi < 3; xi += 1) {
      html += `<i style="background:${cores[yi][xi]}"></i>`;
    }
  }
  return html;
}

const ROTULO_CLASSE = ["Baixo", "Médio", "Alto"];

export function eixosSelecao() {
  // CAMADAS_SELECAO vem invertida para o desenho; no seletor volta a ordem dos critérios.
  return [...CAMADAS_SELECAO].reverse().map((c) => {
    const criterio = c.campos.find((item) => item[2] === "n");
    const [eixo, resto] = c.titulo.split(" · ");
    return {
      id: c.id,
      campo: criterio[0],
      titulo: c.titulo,
      eixo,
      nome: resto || c.titulo,
      campos: c.campos,
    };
  });
}

export function eixoPorId(id) {
  return eixosSelecao().find((e) => e.id === id) ?? null;
}

export function fonteBivariado(mapa) {
  if (mapa) {
    const comFonte = CAMADAS_SELECAO.find((c) => mapa.getSource(c.id));
    if (comFonte) return comFonte.id;
  }
  return CAMADAS_SELECAO[0]?.id ?? null;
}

export function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function tercis(valores) {
  const v = valores.filter((n) => n !== null).sort((a, b) => a - b);
  if (!v.length) return [0, 0];
  const at = (p) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return [at(1 / 3), at(2 / 3)];
}

export function classeDe(valor, quebras) {
  const n = numero(valor);
  if (n === null) return -1;
  if (n <= quebras[0]) return 0;
  if (n <= quebras[1]) return 1;
  return 2;
}

function fmt(n) {
  if (!Number.isFinite(n)) return "—";
  const casas = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

function faixa(i, quebras) {
  if (i === 0) return `até ${fmt(quebras[0])}`;
  if (i === 1) return `${fmt(quebras[0])} a ${fmt(quebras[1])}`;
  return `acima de ${fmt(quebras[1])}`;
}

function ausente(campo) {
  return ["any",
    ["!", ["has", campo]],
    ["==", ["get", campo], null],
    ["==", ["to-string", ["get", campo]], ""],
  ];
}

function classeExpr(campo, quebras) {
  return ["case",
    ["<=", ["to-number", ["get", campo], -1e30], quebras[0]], 0,
    ["<=", ["to-number", ["get", campo], -1e30], quebras[1]], 1,
    2,
  ];
}

export function expressaoCor(campoX, campoY, qx, qy, cores) {
  const grade = cores ?? paletaPorId(PALETA_PADRAO).cores;
  const chave = ["concat",
    ["to-string", classeExpr(campoX, qx)],
    ["to-string", classeExpr(campoY, qy)],
  ];
  const match = ["match", chave];
  for (let x = 0; x < 3; x += 1) {
    for (let y = 0; y < 3; y += 1) {
      match.push(`${x}${y}`, grade[y][x]);
    }
  }
  match.push(COR_SEM_DADO);
  return ["case", ["any", ausente(campoX), ausente(campoY)], COR_SEM_DADO, match];
}

export function resumoBivariado(feicoes, estado) {
  const { x, y, qx, qy, recorte } = estado;
  const paleta = paletaPorId(estado.paleta?.id ?? estado.paleta);
  const cores = paleta.cores;
  const celulas = [];
  for (let yi = 2; yi >= 0; yi -= 1) {
    for (let xi = 0; xi < 3; xi += 1) {
      celulas.push({
        xi, yi,
        rotulo: `${ROTULO_CLASSE[yi]} × ${ROTULO_CLASSE[xi].toLowerCase()}`,
        cor: cores[yi][xi],
        nomes: [],
      });
    }
  }
  const porChave = new Map(celulas.map((c) => [`${c.xi}${c.yi}`, c]));
  let semDado = 0;
  for (const p of feicoes) {
    const cx = classeDe(p[x.campo], qx);
    const cy = classeDe(p[y.campo], qy);
    if (cx < 0 || cy < 0) {
      semDado += 1;
      continue;
    }
    const c = porChave.get(`${cx}${cy}`);
    const nome = p.nm_mun ? `${p.nm_mun}${p.sigla_uf ? ` (${p.sigla_uf})` : ""}` : null;
    if (c && nome && !c.nomes.includes(nome)) c.nomes.push(nome);
  }
  for (const c of celulas) c.nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return {
    bivariado: true,
    feicoes: feicoes.length,
    recorte,
    x: x.nome,
    y: y.nome,
    paleta: paleta.nome,
    daltonismo: paleta.daltonismo,
    faixasX: ROTULO_CLASSE.map((_, i) => faixa(i, qx)),
    faixasY: ROTULO_CLASSE.map((_, i) => faixa(i, qy)),
    celulas,
    semDado,
  };
}

export function montarCamada({ x, y, qx, qy, n, recorte, paleta }) {
  const p = paletaPorId(paleta?.id ?? paleta);
  const cores = p.cores;
  const legenda = [];
  for (let yi = 2; yi >= 0; yi -= 1) {
    for (let xi = 0; xi < 3; xi += 1) {
      legenda.push([`${ROTULO_CLASSE[yi]} × ${ROTULO_CLASSE[xi].toLowerCase()}`, cores[yi][xi]]);
    }
  }
  const notaDaltonismo = p.daltonismo ? " Amigável a daltonismo." : "";
  return {
    id: ID_BIVARIADO,
    titulo: "Dois eixos",
    tema: "selecao",
    tipo: "fill",
    geometria: "MULTIPOLYGON",
    pintura: { "fill-color": expressaoCor(x.campo, y.campo, qx, qy, cores), "fill-opacity": 0.85 },
    contorno: { "line-color": "#ffffff", "line-width": 0.6 },
    legenda,
    titulo_popup: "nm_mun",
    campos: x.campos,
    fonte: "Tabela integrada de municípios, demanda 018 (Ernani, MapBiomas, CNUC, MMA, ICMBio, Sühs et al. 2025)",
    nota: `Tercis entre os ${n} municípios ${recorte}. Horizontal: ${x.nome}. Vertical: ${y.nome}. Paleta: ${p.nome}.${notaDaltonismo}`,
    gradeBivariada: {
      x: x.nome,
      y: y.nome,
      qx,
      qy,
      cores,
      paleta: p.nome,
      rotulos: ROTULO_CLASSE,
      faixasX: ROTULO_CLASSE.map((_, i) => faixa(i, qx)),
      faixasY: ROTULO_CLASSE.map((_, i) => faixa(i, qy)),
    },
  };
}

export function htmlGrade(grade) {
  if (!grade) return "";
  let celulas = "";
  for (let yi = 2; yi >= 0; yi -= 1) {
    for (let xi = 0; xi < 3; xi += 1) {
      const titulo = `${grade.y}: ${grade.rotulos[yi].toLowerCase()} (${grade.faixasY[yi]}). `
        + `${grade.x}: ${grade.rotulos[xi].toLowerCase()} (${grade.faixasX[xi]}).`;
      celulas += `<i style="background:${grade.cores[yi][xi]}" title="${titulo}"></i>`;
    }
  }
  return `<div class="grade-bivariada">`
    + `<span class="eixo-y" title="${grade.y}"><b>Alto</b> ${grade.y} <b>Baixo</b></span>`
    + `<div class="miolo">`
    + `<div class="celulas">${celulas}</div>`
    + `<span class="eixo-x"><b>Baixo</b> ${grade.x} <b>Alto →</b></span>`
    + `</div></div>`;
}

export function htmlOpcoes() {
  const grupos = new Map();
  for (const e of eixosSelecao()) {
    if (!grupos.has(e.eixo)) grupos.set(e.eixo, []);
    grupos.get(e.eixo).push(e);
  }
  let html = '<option value="">Escolha um critério</option>';
  for (const [eixo, lista] of grupos) {
    html += `<optgroup label="${eixo}">`;
    for (const e of lista) html += `<option value="${e.id}">${e.nome}</option>`;
    html += "</optgroup>";
  }
  return html;
}
