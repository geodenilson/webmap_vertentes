import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SUPABASE_URL, SUPABASE_CHAVE, BASE_OFICIAL } from "./config.js";
import { CAMADAS, TEMAS, RESUMO } from "./camadas.js";
import { exportarPDF } from "./pdf.js";
import { prepararSimbologia, abrirSimbologia } from "./simbologia.js";
import { itensLegenda, amostraDe, misturarComBranco, comClassesPresentes } from "./legenda.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE);
const URL_TILE = `${SUPABASE_URL}/rest/v1/rpc/tile`;
const FUNDO_MAPA = "https://tiles.openfreemap.org/styles/positron";
const SATELITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Recorte inicial ate a lista dos nucleos chegar do banco. Depois vale o retangulo dos seis.
let VISTA_INICIAL = [[-56.2, -20.4], [-44.5, -12.6]];

let token = null;
let mapa = null;
let fundo = "mapa";
let nucleoAtual = null;
let municipioAtual = null;
let municipios = [];
// Camadas com alguma feicao no nucleo ou municipio escolhido. null na vista dos seis nucleos.
let presentes = null;
const contornosMunicipios = new Map();
let nucleos = [];
let contornos = null;
let rotulosUF = [];
const catalogo = new Map();
const ligadas = new Set(CAMADAS.filter((c) => c.ligada).map((c) => c.id));

const $ = (id) => document.getElementById(id);

prepararSimbologia(CAMADAS);

// Login ----------------------------------------------------------------------

supabase.auth.onAuthStateChange((_evento, sessao) => {
  token = sessao?.access_token ?? null;
});

async function iniciar() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    token = data.session.access_token;
    await abrirMapa();
  } else {
    $("tela-login").hidden = false;
  }
}

$("form-login").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const botao = evento.submitter;
  botao.disabled = true;
  $("erro-login").hidden = true;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("senha").value,
  });
  botao.disabled = false;
  if (error) {
    $("erro-login").textContent = "E-mail ou senha não conferem.";
    $("erro-login").hidden = false;
    return;
  }
  token = data.session.access_token;
  $("senha").value = "";
  await abrirMapa();
});

$("sair").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

// Regras de exibicao ---------------------------------------------------------

// Camadas pesadas (CAR, SIGEF, SNCI, PRODES anual, drenagem, ASV) tem zoom minimo no
// catalogo. Elas so aparecem com um nucleo escolhido, ja na escala do nucleo inteiro.
function precisaDeNucleo(camada) {
  return (catalogo.get(camada.id)?.zoom_minimo ?? 0) > 0;
}

function disponivel(camada) {
  return !precisaDeNucleo(camada) || nucleoAtual !== null;
}

// Camada sem nada no recorte escolhido nao aparece no painel. Bioma e limite estadual, de
// contexto, ficam sempre.
function presente(camada) {
  return presentes === null || camada.contexto || presentes.has(camada.id);
}

function visivel(camada) {
  return ligadas.has(camada.id) && disponivel(camada) && presente(camada);
}

async function atualizarPresentes() {
  if (nucleoAtual === null) {
    presentes = null;
    return;
  }
  const { data, error } = await supabase.rpc("camadas_presentes", {
    nucleo: nucleoAtual,
    municipio: municipioAtual?.cd_mun ?? null,
  });
  if (error) {
    console.error(error);
    presentes = null;
    return;
  }
  presentes = new Set(data ?? []);
}

function urlTile(camada) {
  let url = `${URL_TILE}?camada=${camada.id}&z={z}&x={x}&y={y}`;
  if (camada.contexto || nucleoAtual === null) return url;
  url += `&nucleo=${nucleoAtual}`;
  if (municipioAtual) url += `&municipio=${municipioAtual.cd_mun}`;
  return url;
}

// Mapa -----------------------------------------------------------------------

async function abrirMapa() {
  $("tela-login").hidden = true;
  $("tela-mapa").hidden = false;

  const [cat, lug, cont, rot, mun] = await Promise.all([
    supabase.rpc("camadas_webmap"),
    supabase.rpc("lugares_webmap"),
    supabase.rpc("contornos_pdf"),
    supabase.rpc("rotulos_uf"),
    supabase.rpc("municipios_webmap"),
  ]);
  for (const r of [cat, cont, rot, mun]) if (r.error) console.error(r.error);
  municipios = mun.data ?? [];
  for (const ficha of cat.data ?? []) catalogo.set(ficha.camada, ficha);
  // A geometria de origem decide o simbolo da legenda: retangulo, traco ou ponto.
  for (const camada of CAMADAS) camada.geometria = catalogo.get(camada.id)?.geometria;
  contornos = cont.data ?? null;
  rotulosUF = rot.data ?? [];
  // Por ora o mapa trabalha so com os seis nucleos em execucao.
  nucleos = (lug.data ?? [])
    .filter((l) => l.tipo === "nucleo" && l.selecionado === "Sim")
    .sort((a, b) => a.nucleo - b.nucleo);
  if (nucleos.length) {
    VISTA_INICIAL = [
      [Math.min(...nucleos.map((n) => n.oeste)), Math.min(...nucleos.map((n) => n.sul))],
      [Math.max(...nucleos.map((n) => n.leste)), Math.max(...nucleos.map((n) => n.norte))],
    ];
  }

  montarSeletorDeNucleo();
  montarPainel();

  mapa = new maplibregl.Map({
    container: "mapa",
    style: FUNDO_MAPA,
    bounds: VISTA_INICIAL,
    attributionControl: { compact: true },
    preserveDrawingBuffer: true,
    transformRequest: (url) => {
      if (url.startsWith(URL_TILE)) {
        return {
          url,
          headers: {
            apikey: SUPABASE_CHAVE,
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.mapbox-vector-tile",
          },
        };
      }
      return { url };
    },
  });
  mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
  mapa.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  window.mapaVertentes = mapa;
  mapa.on("load", () => {
    adicionarSatelite();
    for (const camada of CAMADAS) {
      if (catalogo.has(camada.id)) adicionarCamada(camada);
    }
    // O preenchimento do nucleo vai para baixo de todas as camadas e o contorno fica em
    // cima: assim o tom do nucleo nao apaga o passivo, a UC e o resto.
    const primeira = CAMADAS.find((c) => mapa.getLayer(c.id));
    for (const camada of CAMADAS.filter((c) => c.preenchimentoEmbaixo && mapa.getLayer(c.id))) {
      if (camada !== primeira) mapa.moveLayer(camada.id, primeira.id);
    }
    // Nomes por cima de todas as camadas, na ordem do painel.
    for (const camada of CAMADAS) {
      if (mapa.getLayer(`${camada.id}__rotulo`)) mapa.moveLayer(`${camada.id}__rotulo`);
    }
    adicionarRotulosUF();
    atualizarVisibilidade();
  });
  mapa.on("click", consultar);
  // As classes da legenda dependem do que esta desenhado: refaz quando o mapa assenta.
  mapa.on("idle", desenharLegenda);
  mapa.on("error", async (e) => {
    if (e?.error?.status !== 401) return;
    const { data } = await supabase.auth.refreshSession();
    if (!data.session) {
      await supabase.auth.signOut();
      location.reload();
    }
  });
}

function adicionarSatelite() {
  mapa.addSource("satelite", {
    type: "raster", tiles: [SATELITE], tileSize: 256, maxzoom: 19,
    attribution: "Esri World Imagery",
  });
  mapa.addLayer({ id: "satelite", type: "raster", source: "satelite", layout: { visibility: "none" } });
}

// Sigla dos estados, sempre ligada e por cima de tudo, como nos mapas da colecao. O ponto
// de cada sigla vem do banco por recorte, para cair dentro da tela na vista escolhida.
function dadosRotulosUF() {
  return {
    type: "FeatureCollection",
    features: rotulosUF
      .filter((r) => (r.nucleo ?? null) === nucleoAtual)
      .map((r) => ({ type: "Feature", properties: { uf: r.uf }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } })),
  };
}

function adicionarRotulosUF() {
  mapa.addSource("rotulos_uf", { type: "geojson", data: dadosRotulosUF() });
  mapa.addLayer({
    id: "rotulos_uf",
    type: "symbol",
    source: "rotulos_uf",
    layout: {
      "text-field": ["get", "uf"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 15,
      "text-letter-spacing": 0.08,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#9b917d", "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
  });
}

function adicionarCamada(camada) {
  mapa.addSource(camada.id, { type: "vector", tiles: [urlTile(camada)], maxzoom: 15 });
  const comum = { source: camada.id, "source-layer": camada.id };
  if (camada.filtro) comum.filter = camada.filtro;

  mapa.addLayer({ id: camada.id, type: camada.tipo, ...comum, layout: { visibility: "none" }, paint: camada.pintura });
  if (camada.contorno) {
    mapa.addLayer({ id: `${camada.id}__contorno`, type: "line", ...comum, layout: { visibility: "none" }, paint: camada.contorno });
  }
  // Feicao menor que dois pixels chega do banco como ponto. O circulo usa a cor da classe.
  if (camada.tipo === "fill" && catalogo.get(camada.id)?.vira_ponto) {
    const soPonto = ["==", ["geometry-type"], "Point"];
    mapa.addLayer({
      id: `${camada.id}__ponto`,
      type: "circle",
      ...comum,
      filter: camada.filtro ? ["all", soPonto, camada.filtro] : soPonto,
      layout: { visibility: "none" },
      paint: {
        "circle-color": camada.pintura["fill-color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 1.4, 10, 2.2, 14, 3],
        "circle-opacity": 0.9,
      },
    });
  }
  if (camada.rotulo) adicionarRotulo(camada, comum);
}

// Rotulos -----------------------------------------------------------------------
// O botao Aa do painel liga o nome da camada no mapa. Poligono recebe um ponto por feicao,
// calculado no banco para o recorte (rotulos_camada); linha e ponto rotulam pelo tile.

const CHAVE_ROTULOS = "vertentes_rotulos_v1";
const rotuladas = new Set(lerRotuladas());
const rotulosCarregados = new Map();

function lerRotuladas() {
  try {
    const salvas = JSON.parse(localStorage.getItem(CHAVE_ROTULOS) || "null");
    return Array.isArray(salvas) ? salvas : ["sedes_municipais_bc250_2025"];
  } catch { return ["sedes_municipais_bc250_2025"]; }
}

function ehPoligono(camada) {
  return (catalogo.get(camada.id)?.geometria || "").toUpperCase().includes("POLYGON");
}

function adicionarRotulo(camada, comum) {
  const id = `${camada.id}__rotulo`;
  const texto = {
    visibility: "none",
    "text-font": ["Noto Sans Regular"],
    "text-size": 11,
    "text-max-width": 9,
    "text-padding": 4,
  };
  const pintura = { "text-color": "#2b2b2b", "text-halo-color": "#ffffff", "text-halo-width": 1.4 };
  if (ehPoligono(camada)) {
    mapa.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    mapa.addLayer({ id, type: "symbol", source: id, layout: { ...texto, "text-field": ["get", "nome"] }, paint: pintura });
  } else if (camada.tipo === "line") {
    mapa.addLayer({
      id, type: "symbol", ...comum,
      layout: { ...texto, "text-field": ["get", camada.rotulo], "symbol-placement": "line", "text-font": ["Noto Sans Italic"] },
      paint: { ...pintura, "text-color": "#2f5f80" },
    });
  } else {
    mapa.addLayer({
      id, type: "symbol", ...comum, minzoom: 8,
      layout: { ...texto, "text-field": ["get", camada.rotulo], "text-offset": [0, 0.9], "text-anchor": "top" },
      paint: pintura,
    });
  }
}

function rotuloVisivel(camada) {
  return Boolean(camada.rotulo) && rotuladas.has(camada.id) && visivel(camada);
}

async function carregarRotulos(camada) {
  const chave = `${nucleoAtual}|${municipioAtual?.cd_mun ?? ""}`;
  if (!ehPoligono(camada) || rotulosCarregados.get(camada.id) === chave) return;
  rotulosCarregados.set(camada.id, chave);
  const { data, error } = await supabase.rpc("rotulos_camada", {
    camada: camada.id,
    campo: camada.rotulo,
    nucleo: nucleoAtual,
    municipio: municipioAtual?.cd_mun ?? null,
  });
  if (error) {
    console.error(camada.id, error);
    rotulosCarregados.delete(camada.id);
    return;
  }
  // O recorte pode ter mudado enquanto o banco respondia.
  if (rotulosCarregados.get(camada.id) === chave) mapa.getSource(`${camada.id}__rotulo`)?.setData(data);
}

function alternarRotulo(camada) {
  if (rotuladas.has(camada.id)) {
    rotuladas.delete(camada.id);
  } else {
    rotuladas.add(camada.id);
    if (!ligadas.has(camada.id)) {
      ligadas.add(camada.id);
      const caixa = document.querySelector(`.camada[data-camada="${camada.id}"] input`);
      if (caixa) caixa.checked = true;
    }
  }
  localStorage.setItem(CHAVE_ROTULOS, JSON.stringify([...rotuladas]));
  atualizarVisibilidade();
}

function atualizarVisibilidade() {
  if (!mapa) return;
  for (const camada of CAMADAS) {
    if (!mapa.getLayer(camada.id)) continue;
    const valor = visivel(camada) ? "visible" : "none";
    for (const sufixo of ["", "__contorno", "__ponto"]) {
      if (mapa.getLayer(camada.id + sufixo)) mapa.setLayoutProperty(camada.id + sufixo, "visibility", valor);
    }
    if (mapa.getLayer(`${camada.id}__rotulo`)) {
      const comNome = rotuloVisivel(camada);
      mapa.setLayoutProperty(`${camada.id}__rotulo`, "visibility", comNome ? "visible" : "none");
      if (comNome) carregarRotulos(camada);
    }
    const botao = document.querySelector(`[data-rotulo="${camada.id}"]`);
    if (botao) botao.setAttribute("aria-pressed", String(rotuladas.has(camada.id)));
  }
  atualizarPainel();
  desenharLegenda();
}

function alternar(id, ligar) {
  if (ligar) ligadas.add(id); else ligadas.delete(id);
  atualizarVisibilidade();
}

// Nucleo ---------------------------------------------------------------------

function montarSeletorDeNucleo() {
  const seletor = $("nucleo");
  for (const n of nucleos) {
    const opcao = document.createElement("option");
    opcao.value = n.nucleo;
    opcao.textContent = `${n.nucleo} · ${n.nome}`;
    seletor.appendChild(opcao);
  }
  seletor.addEventListener("change", (e) => escolherNucleo(e.target.value === "" ? null : Number(e.target.value)));
  $("municipio").addEventListener("change", (e) => escolherMunicipio(e.target.value || null));
}

function recarregarTiles() {
  for (const camada of CAMADAS) {
    const fonte = mapa.getSource(camada.id);
    if (fonte) fonte.setTiles([urlTile(camada)]);
  }
}

function montarSeletorDeMunicipio() {
  const seletor = $("municipio");
  seletor.innerHTML = "";
  if (nucleoAtual === null) {
    seletor.disabled = true;
    seletor.innerHTML = '<option value="">Escolha um núcleo antes</option>';
    return;
  }
  seletor.disabled = false;
  seletor.innerHTML = '<option value="">Todos os municípios do núcleo</option>'
    + municipios
      .filter((m) => m.nucleo === nucleoAtual)
      .map((m) => `<option value="${m.cd_mun}">${m.nm_mun} (${m.uf})</option>`)
      .join("");
}

async function carregarContornosMunicipios(numero) {
  if (numero === null || contornosMunicipios.has(numero)) return;
  const { data, error } = await supabase.rpc("contornos_municipios", { nucleo: numero });
  if (error) console.error(error);
  contornosMunicipios.set(numero, data ?? []);
}

async function escolherNucleo(numero) {
  nucleoAtual = numero;
  municipioAtual = null;
  montarSeletorDeMunicipio();
  carregarContornosMunicipios(numero);
  recarregarTiles();
  destacarMunicipio();
  mapa.getSource("rotulos_uf")?.setData(dadosRotulosUF());
  await atualizarPresentes();
  atualizarVisibilidade();
  const alvo = nucleos.find((n) => n.nucleo === numero);
  const limites = alvo ? [[alvo.oeste, alvo.sul], [alvo.leste, alvo.norte]] : VISTA_INICIAL;
  mapa.fitBounds(limites, { padding: 30, duration: 900 });
}

// Com um municipio escolhido, todas as camadas do nucleo chegam recortadas por ele e o mapa
// centraliza nele. Bioma e limite estadual seguem inteiros como contexto.
async function escolherMunicipio(codigo) {
  municipioAtual = codigo
    ? municipios.find((m) => m.cd_mun === codigo && m.nucleo === nucleoAtual) ?? null
    : null;
  recarregarTiles();
  destacarMunicipio();
  await atualizarPresentes();
  atualizarVisibilidade();
  const alvo = municipioAtual ?? nucleos.find((n) => n.nucleo === nucleoAtual);
  if (alvo) mapa.fitBounds([[alvo.oeste, alvo.sul], [alvo.leste, alvo.norte]], { padding: 40, duration: 900 });
}

// Painel ---------------------------------------------------------------------

// Retangulo para poligono (vazado quando so ha contorno), traco para linha, ponto para ponto.
function amostraHTML(amostra) {
  if (amostra.simbolo === "linha") {
    return `<span class="amostra linha" style="border-top-color:${amostra.cor}"></span>`;
  }
  if (amostra.simbolo === "ponto") {
    return `<span class="amostra ponto" style="background:${amostra.cor}"></span>`;
  }
  const fundo = amostra.preenchimento
    ? `rgb(${misturarComBranco(amostra.preenchimento, amostra.opacidade ?? 1).join(",")})`
    : "transparent";
  return `<span class="amostra" style="background:${fundo};border:1.5px solid ${amostra.borda}"></span>`;
}

function aoMudarSimbologia() {
  for (const camada of CAMADAS) {
    const amostra = document.querySelector(`[data-amostra="${camada.id}"]`);
    if (amostra) amostra.outerHTML = amostraComChave(camada);
  }
  desenharLegenda();
}

function amostraComChave(camada) {
  const amostra = amostraDe(camada, camada.legenda[0][1]);
  return amostraHTML(amostra).replace("<span ", `<span data-amostra="${camada.id}" `);
}

function montarPainel() {
  const lista = $("lista-camadas");
  lista.innerHTML = "";
  for (const [tema, nome] of TEMAS) {
    const doTema = CAMADAS.filter((c) => c.tema === tema && catalogo.has(c.id)).reverse();
    if (!doTema.length) continue;
    const grupo = document.createElement("details");
    grupo.className = "tema";
    // Todos os temas abrem fechados, para se ver de saida tudo o que ha disponivel.
    grupo.open = false;
    grupo.innerHTML = `<summary>${nome}</summary>`;
    for (const camada of doTema) {
      const linha = document.createElement("label");
      linha.className = "camada";
      linha.dataset.camada = camada.id;
      linha.title = "Botão direito: cor, transparência e espessura";
      linha.innerHTML = `<input type="checkbox" ${ligadas.has(camada.id) ? "checked" : ""}>`
        + amostraComChave(camada)
        + `<span>${camada.titulo}</span><small data-aviso="${camada.id}" hidden></small>`
        + (camada.rotulo
          ? `<button type="button" class="botao-rotulo" data-rotulo="${camada.id}" aria-pressed="${rotuladas.has(camada.id)}" title="Mostrar os nomes no mapa">Aa</button>`
          : "");
      linha.querySelector("input").addEventListener("change", (e) => alternar(camada.id, e.target.checked));
      linha.querySelector(".botao-rotulo")?.addEventListener("click", (e) => {
        e.preventDefault();
        alternarRotulo(camada);
      });
      linha.addEventListener("contextmenu", (e) => abrirSimbologia(e, camada, mapa, CAMADAS, aoMudarSimbologia));
      grupo.appendChild(linha);
    }
    lista.appendChild(grupo);
  }
}

function atualizarPainel() {
  for (const camada of CAMADAS) {
    const linha = document.querySelector(`.camada[data-camada="${camada.id}"]`);
    if (!linha) continue;
    linha.hidden = !presente(camada);
    const livre = disponivel(camada);
    linha.classList.toggle("indisponivel", !livre);
    linha.querySelector("input").disabled = !livre;
    const aviso = linha.querySelector("[data-aviso]");
    aviso.hidden = livre;
    aviso.textContent = livre ? "" : "Escolha um núcleo para ver esta camada.";
  }
  // Tema sem nenhuma camada presente some do painel.
  for (const grupo of document.querySelectorAll("#lista-camadas details.tema")) {
    grupo.hidden = ![...grupo.querySelectorAll(".camada")].some((l) => !l.hidden);
  }
}

function desenharLegenda() {
  const caixa = $("legenda");
  const visiveis = CAMADAS.filter(visivel).reverse();
  if (!visiveis.length) { caixa.innerHTML = ""; return; }
  let html = "<h2>Legenda</h2>";
  for (const camada of visiveis) {
    // So as classes que aparecem no desenho da tela.
    const ids = mapa ? [camada.id, `${camada.id}__contorno`, `${camada.id}__ponto`].filter((id) => mapa.getLayer(id)) : [];
    const feicoes = ids.length ? mapa.queryRenderedFeatures({ layers: ids }) : [];
    itensLegenda(comClassesPresentes(camada, feicoes)).forEach((item, i) => {
      // A lixeira fica na primeira linha da camada: no titulo, ou na linha unica.
      const lixeira = i === 0 ? botaoRemover(camada) : "";
      html += item.tipo === "titulo"
        ? `<div class="grupo" data-camada="${item.camada}">${lixeira}<span>${item.texto}</span></div>`
        : `<div class="item${item.nivel ? " classe" : ""}" data-camada="${item.camada}">${lixeira}${amostraHTML(item)}<span>${item.texto}</span></div>`;
    });
  }
  // So troca o conteudo quando mudou, para a legenda nao piscar a cada desenho do mapa.
  if (caixa.innerHTML !== html) caixa.innerHTML = html;
}

function botaoRemover(camada) {
  return `<button type="button" class="remover" data-remover="${camada.id}" title="Desligar ${camada.titulo}" aria-label="Desligar ${camada.titulo}">`
    + '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M6 1h4l1 1h3v2H2V2h3l1-1zm-3 4h10l-1 10H4L3 5zm3 2v6h1V7H6zm3 0v6h1V7H9z"/></svg>'
    + "</button>";
}

$("legenda").addEventListener("click", (e) => {
  const botao = e.target.closest("[data-remover]");
  if (!botao) return;
  const id = botao.dataset.remover;
  const caixa = document.querySelector(`.camada[data-camada="${id}"] input`);
  if (caixa) caixa.checked = false;
  alternar(id, false);
});

// Com um municipio escolhido, o contorno dele fica mais grosso, na mesma cor.
function destacarMunicipio() {
  const id = "municipios_malha_2025__contorno";
  if (!mapa?.getLayer(id)) return;
  const camada = CAMADAS.find((c) => c.id === "municipios_malha_2025");
  const base = camada.contorno["line-width"];
  mapa.setPaintProperty(id, "line-width", municipioAtual ? Math.max(base * 3.5, 2.2) : base);
}

$("legenda").addEventListener("contextmenu", (e) => {
  const alvo = e.target.closest("[data-camada]");
  if (!alvo) return;
  const camada = CAMADAS.find((c) => c.id === alvo.dataset.camada);
  if (camada) abrirSimbologia(e, camada, mapa, CAMADAS, aoMudarSimbologia);
});

document.querySelectorAll('input[name="fundo"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    fundo = e.target.value;
    mapa.setLayoutProperty("satelite", "visibility", fundo === "satelite" ? "visible" : "none");
  });
});

// Consulta -------------------------------------------------------------------

function consultar(evento) {
  const camadasNoMapa = CAMADAS.filter((c) => visivel(c) && mapa.getLayer(c.id))
    .flatMap((c) => (mapa.getLayer(`${c.id}__ponto`) ? [c.id, `${c.id}__ponto`] : [c.id]));
  const achados = mapa.queryRenderedFeatures(evento.point, { layers: camadasNoMapa });
  if (!achados.length) return;
  const vistos = new Set();
  let html = "";
  for (const feicao of achados) {
    const camada = CAMADAS.find((c) => c.id === feicao.layer.id.replace(/__ponto$/, ""));
    if (vistos.has(camada.id) || vistos.size >= 3) continue;
    vistos.add(camada.id);
    const titulo = camada.titulo_popup ? feicao.properties[camada.titulo_popup] : null;
    html += `<h3>${camada.titulo}${titulo ? ` · ${titulo}` : ""}</h3><table>`;
    for (const [campo, valor] of Object.entries(feicao.properties)) {
      if (valor === null || valor === "") continue;
      html += `<tr><td>${campo}</td><td>${valor}</td></tr>`;
    }
    html += "</table>";
    if (camada.nota) html += `<p class="sub">${camada.nota}</p>`;
  }
  new maplibregl.Popup({ maxWidth: "340px" }).setLngLat(evento.lngLat).setHTML(html).addTo(mapa);
}

// PDF ------------------------------------------------------------------------

// Camadas de moldura: entram na lista da pagina de informacoes, mas desmarcadas.
const MOLDURA = new Set(["nucleos_malha_2025", "municipios_malha_2025", "limite_estadual_malha_2025"]);

const MODOS_RESUMO = [
  ["completo", "Números, gráfico e lista"],
  ["grafico", "Números e gráfico"],
  ["numeros", "Só os números"],
];

function textoRecorte() {
  const alvo = nucleos.find((n) => n.nucleo === nucleoAtual);
  let recorte = alvo ? `Núcleo ${alvo.nucleo}, ${alvo.nome}` : "Os seis núcleos em execução";
  if (municipioAtual) recorte = `${municipioAtual.nm_mun} (${municipioAtual.uf}) · ${recorte}`;
  return recorte;
}

function montarListaPDF() {
  const lista = $("lista-pdf");
  const candidatas = CAMADAS.filter(visivel).reverse();
  if (!candidatas.length) {
    lista.innerHTML = '<p class="sub">Nenhuma camada ligada.</p>';
    return;
  }
  lista.innerHTML = candidatas.map((camada) => {
    const marcada = !MOLDURA.has(camada.id) ? "checked" : "";
    const opcoes = MODOS_RESUMO.map(([v, r]) => `<option value="${v}">${r}</option>`).join("");
    return `<label class="linha-pdf"><input type="checkbox" data-pdf="${camada.id}" ${marcada}>`
      + `${amostraComChave(camada)}<span>${camada.titulo}</span>`
      + `<select data-modo="${camada.id}">${opcoes}</select></label>`;
  }).join("");
}

function abrirDialogoPDF() {
  montarListaPDF();
  $("aviso-dialogo").hidden = true;
  $("escolha-camadas").hidden = document.querySelector('input[name="modo-pdf"]:checked').value !== "informacoes";
  $("fundo-dialogo").hidden = false;
}

function fecharDialogoPDF() {
  $("fundo-dialogo").hidden = true;
}

document.querySelectorAll('input[name="modo-pdf"]').forEach((radio) => {
  radio.addEventListener("change", (e) => { $("escolha-camadas").hidden = e.target.value !== "informacoes"; });
});
$("cancelar-pdf").addEventListener("click", fecharDialogoPDF);
$("fundo-dialogo").addEventListener("mousedown", (e) => { if (e.target.id === "fundo-dialogo") fecharDialogoPDF(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("fundo-dialogo").hidden) fecharDialogoPDF(); });
$("exportar").addEventListener("click", abrirDialogoPDF);

// Resumo de cada camada escolhida, calculado no banco para o recorte da tela. Um pedido por
// vez, para nao disputar o banco com os tiles; a camada que falha duas vezes vai para a
// folha com aviso.
async function buscarResumos(escolhas, aviso) {
  const respostas = [];
  for (const [i, { camada, modo }] of escolhas.entries()) {
    aviso.textContent = `Calculando as informações no banco: ${camada.titulo} (${i + 1} de ${escolhas.length}).`;
    const campos = RESUMO[camada.id] ?? {};
    const parametros = {
      camada: camada.id,
      nucleo: nucleoAtual,
      municipio: municipioAtual?.cd_mun ?? null,
      campo_classe: modo === "numeros" ? null : campos.classe ?? null,
      campo_nome: modo === "completo" ? campos.nome ?? null : null,
    };
    let { data, error } = await supabase.rpc("resumo_camada", parametros);
    if (error) ({ data, error } = await supabase.rpc("resumo_camada", parametros));
    if (error) console.error(camada.id, error);
    respostas.push({ camada, modo, campos, resumo: error ? null : data });
  }
  return respostas;
}

$("dialogo-pdf").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const comInformacoes = document.querySelector('input[name="modo-pdf"]:checked').value === "informacoes";
  const escolhas = comInformacoes
    ? [...document.querySelectorAll("#lista-pdf [data-pdf]:checked")].map((caixa) => ({
      camada: CAMADAS.find((c) => c.id === caixa.dataset.pdf),
      modo: document.querySelector(`[data-modo="${caixa.dataset.pdf}"]`).value,
    }))
    : [];

  const botao = $("confirmar-pdf");
  const avisoDialogo = $("aviso-dialogo");
  botao.disabled = true;
  avisoDialogo.hidden = false;
  try {
    let resumos = [];
    if (escolhas.length) {
      resumos = await buscarResumos(escolhas, avisoDialogo);
    }
    avisoDialogo.textContent = "Desenhando o mapa na folha. Leva alguns segundos.";
    await carregarContornosMunicipios(nucleoAtual);
    await exportarPDF(mapa, {
      titulo: $("titulo-pdf").value.trim(),
      recorte: textoRecorte(),
      nucleoAtual,
      municipioAtual: municipioAtual?.cd_mun ?? null,
      contornos,
      contornosMunicipios: contornosMunicipios.get(nucleoAtual) ?? [],
      camadas: CAMADAS.filter(visivel).reverse(),
      catalogo,
      fundo,
      base: BASE_OFICIAL,
      resumos,
    });
    fecharDialogoPDF();
    $("aviso-pdf").hidden = false;
    $("aviso-pdf").textContent = "PDF salvo na pasta de downloads.";
  } catch (erro) {
    console.error(erro);
    avisoDialogo.textContent = "Não foi possível gerar o PDF. Veja o console do navegador.";
  } finally {
    botao.disabled = false;
  }
});

iniciar();
