// Mapa coroplético de dois eixos, a partir de duas camadas do grupo Seleção de municípios.
// Cada município já traz todos os critérios no tile: as classes (tercis) saem no navegador,
// sem tile novo e sem ida ao banco. Paleta sequencial-sequencial de Joshua Stevens
// (ciano × laranja), a mesma ideia do mapa de co-benefícios de Soto-Navarro et al. 2020.

import { CAMADAS_SELECAO } from "./selecao.js";

export const ID_BIVARIADO = "sel_bivariado";
export const COR_SEM_DADO = "#bdbdbd";

// CORES[classe do eixo vertical][classe do eixo horizontal], 0 = baixo, 2 = alto.
// Canto inferior esquerdo claro (baixo-baixo); ciano no alto à esquerda; laranja embaixo
// à direita; marrom escuro no alto à direita (alto nos dois).
export const CORES = [
  ["#e8e8e8", "#e4acac", "#c85a5a"],
  ["#b0d5df", "#ad9ea5", "#985356"],
  ["#64acbe", "#627f8c", "#574249"],
];

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

export function expressaoCor(campoX, campoY, qx, qy) {
  const chave = ["concat",
    ["to-string", classeExpr(campoX, qx)],
    ["to-string", classeExpr(campoY, qy)],
  ];
  const match = ["match", chave];
  for (let x = 0; x < 3; x += 1) {
    for (let y = 0; y < 3; y += 1) {
      match.push(`${x}${y}`, CORES[y][x]);
    }
  }
  match.push(COR_SEM_DADO);
  return ["case", ["any", ausente(campoX), ausente(campoY)], COR_SEM_DADO, match];
}

export function resumoBivariado(feicoes, estado) {
  const { x, y, qx, qy, recorte } = estado;
  const celulas = [];
  for (let yi = 2; yi >= 0; yi -= 1) {
    for (let xi = 0; xi < 3; xi += 1) {
      celulas.push({
        xi, yi,
        rotulo: `${ROTULO_CLASSE[yi]} × ${ROTULO_CLASSE[xi].toLowerCase()}`,
        cor: CORES[yi][xi],
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
    faixasX: ROTULO_CLASSE.map((_, i) => faixa(i, qx)),
    faixasY: ROTULO_CLASSE.map((_, i) => faixa(i, qy)),
    celulas,
    semDado,
  };
}

export function montarCamada({ x, y, qx, qy, n, recorte }) {
  const legenda = [];
  for (let yi = 2; yi >= 0; yi -= 1) {
    for (let xi = 0; xi < 3; xi += 1) {
      legenda.push([`${ROTULO_CLASSE[yi]} × ${ROTULO_CLASSE[xi].toLowerCase()}`, CORES[yi][xi]]);
    }
  }
  return {
    id: ID_BIVARIADO,
    titulo: "Dois eixos",
    tema: "selecao",
    tipo: "fill",
    geometria: "MULTIPOLYGON",
    pintura: { "fill-color": expressaoCor(x.campo, y.campo, qx, qy), "fill-opacity": 0.85 },
    contorno: { "line-color": "#ffffff", "line-width": 0.6 },
    legenda,
    titulo_popup: "nm_mun",
    campos: x.campos,
    fonte: "Tabela integrada de municípios, demanda 018 (Ernani, MapBiomas, CNUC, MMA, ICMBio, Sühs et al. 2025)",
    nota: `Tercis entre os ${n} municípios ${recorte}. Horizontal: ${x.nome}. Vertical: ${y.nome}.`,
    gradeBivariada: {
      x: x.nome,
      y: y.nome,
      qx,
      qy,
      cores: CORES,
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
