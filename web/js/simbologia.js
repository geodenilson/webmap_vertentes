// Menu de simbologia, aberto com o botao direito sobre a camada no painel ou na legenda.
// O padrao de cada camada esta em camadas.js. O que o usuario muda fica guardado no
// navegador dele (localStorage) e vale para a legenda e para o PDF.

// Subir a versao da chave quando a legenda padrao de alguma camada mudar de forma, para nao
// reaproveitar uma legenda salva com outras classes.
const CHAVE = "vertentes_simbologia_v2";
const OPACIDADE = { fill: "fill-opacity", line: "line-opacity", circle: "circle-opacity" };

let caixa = null;

function ler() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch { return {}; }
}

export function prepararSimbologia(camadas) {
  const salvas = ler();
  for (const camada of camadas) {
    camada.padrao = structuredClone({
      pintura: camada.pintura, contorno: camada.contorno ?? null, legenda: camada.legenda,
    });
    const s = salvas[camada.id];
    // Simbologia salva com outro tipo de desenho (comite que era linha e virou poligono)
    // nao serve mais e fica de lado.
    const mesmoTipo = s && Object.keys(s.pintura ?? {}).every((prop) => prop in camada.pintura);
    if (!s || !mesmoTipo) continue;
    camada.pintura = s.pintura;
    if (s.contorno) camada.contorno = s.contorno;
    camada.legenda = s.legenda;
  }
}

function salvar(camadas) {
  const mudadas = {};
  for (const c of camadas) {
    const atual = JSON.stringify({ pintura: c.pintura, contorno: c.contorno ?? null, legenda: c.legenda });
    if (atual !== JSON.stringify(c.padrao)) {
      mudadas[c.id] = { pintura: c.pintura, contorno: c.contorno ?? null, legenda: c.legenda };
    }
  }
  localStorage.setItem(CHAVE, JSON.stringify(mudadas));
}

function trocarCor(valor, antiga, nova) {
  if (typeof valor === "string") return valor.toLowerCase() === antiga.toLowerCase() ? nova : valor;
  if (Array.isArray(valor)) return valor.map((v) => trocarCor(v, antiga, nova));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, trocarCor(v, antiga, nova)]));
  }
  return valor;
}

function aplicar(mapa, camada) {
  for (const [prop, valor] of Object.entries(camada.pintura)) {
    mapa.setPaintProperty(camada.id, prop, valor);
  }
  if (camada.contorno && mapa.getLayer(`${camada.id}__contorno`)) {
    for (const [prop, valor] of Object.entries(camada.contorno)) {
      mapa.setPaintProperty(`${camada.id}__contorno`, prop, valor);
    }
  }
  if (mapa.getLayer(`${camada.id}__ponto`)) {
    mapa.setPaintProperty(`${camada.id}__ponto`, "circle-color", camada.pintura["fill-color"]);
  }
}

// Qual propriedade controla a espessura: a linha da camada, o contorno do poligono ou o raio
// do ponto. Devolve null quando o valor e uma expressao e nao um numero.
function espessura(camada) {
  if (camada.tipo === "line" && typeof camada.pintura["line-width"] === "number") {
    return { alvo: "pintura", prop: "line-width", rotulo: "Espessura da linha", min: 0.2, max: 8 };
  }
  if (camada.tipo === "fill" && camada.contorno && typeof camada.contorno["line-width"] === "number") {
    return { alvo: "contorno", prop: "line-width", rotulo: "Espessura do contorno", min: 0, max: 6 };
  }
  if (camada.tipo === "circle" && typeof camada.pintura["circle-radius"] === "number") {
    return { alvo: "pintura", prop: "circle-radius", rotulo: "Tamanho do ponto", min: 1, max: 12 };
  }
  return null;
}

function fechar() {
  if (caixa) caixa.hidden = true;
}

export function abrirSimbologia(evento, camada, mapa, camadas, aoMudar) {
  evento.preventDefault();
  caixa = document.getElementById("simbologia");

  const coresDaLegenda = new Set(camada.legenda.map(([, cor]) => cor.toLowerCase()));
  const corContorno = camada.contorno && typeof camada.contorno["line-color"] === "string"
    && !coresDaLegenda.has(camada.contorno["line-color"].toLowerCase())
    ? camada.contorno["line-color"] : null;
  const propOpacidade = OPACIDADE[camada.tipo];
  const opacidade = typeof camada.pintura[propOpacidade] === "number" ? camada.pintura[propOpacidade] : 1;
  const largura = espessura(camada);

  let html = `<h2>${camada.titulo}</h2>`;
  camada.legenda.forEach(([rotulo, cor], i) => {
    html += `<label class="linha-cor"><input type="color" data-cor="${i}" value="${cor}"><span>${rotulo}</span></label>`;
  });
  if (corContorno) {
    html += `<label class="linha-cor"><input type="color" data-contorno value="${corContorno}"><span>Contorno</span></label>`;
  }
  html += `<label class="controle"><span>Transparência <b data-saida="opacidade">${Math.round((1 - opacidade) * 100)}%</b></span>`
    + `<input type="range" min="0" max="100" step="5" data-opacidade value="${Math.round((1 - opacidade) * 100)}"></label>`;
  if (largura) {
    const atual = camada[largura.alvo][largura.prop];
    html += `<label class="controle"><span>${largura.rotulo} <b data-saida="largura">${atual}</b></span>`
      + `<input type="range" min="${largura.min}" max="${largura.max}" step="0.1" data-largura value="${atual}"></label>`;
  }
  html += `<div class="acoes"><button type="button" class="discreto" data-padrao>Voltar ao padrão</button>`
    + `<button type="button" data-fechar>Fechar</button></div>`;
  caixa.innerHTML = html;

  const mudou = () => { aplicar(mapa, camada); salvar(camadas); aoMudar(); };

  caixa.querySelectorAll("[data-cor]").forEach((entrada) => {
    entrada.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.cor);
      const antiga = camada.legenda[i][1];
      const nova = e.target.value;
      camada.pintura = trocarCor(camada.pintura, antiga, nova);
      if (camada.contorno) camada.contorno = trocarCor(camada.contorno, antiga, nova);
      camada.legenda = camada.legenda.map((item, j) => (j === i ? [item[0], nova, item[2]] : item));
      mudou();
    });
  });
  caixa.querySelector("[data-contorno]")?.addEventListener("input", (e) => {
    camada.contorno = { ...camada.contorno, "line-color": e.target.value };
    mudou();
  });
  caixa.querySelector("[data-opacidade]").addEventListener("input", (e) => {
    const transparencia = Number(e.target.value);
    camada.pintura = { ...camada.pintura, [propOpacidade]: Math.round(100 - transparencia) / 100 };
    caixa.querySelector('[data-saida="opacidade"]').textContent = `${transparencia}%`;
    mudou();
  });
  caixa.querySelector("[data-largura]")?.addEventListener("input", (e) => {
    const valor = Number(e.target.value);
    camada[largura.alvo] = { ...camada[largura.alvo], [largura.prop]: valor };
    caixa.querySelector('[data-saida="largura"]').textContent = valor;
    mudou();
  });
  caixa.querySelector("[data-padrao]").addEventListener("click", () => {
    const p = structuredClone(camada.padrao);
    camada.pintura = p.pintura;
    if (p.contorno) camada.contorno = p.contorno;
    camada.legenda = p.legenda;
    mudou();
    abrirSimbologia(evento, camada, mapa, camadas, aoMudar);
  });
  caixa.querySelector("[data-fechar]").addEventListener("click", fechar);

  // A posicao vai tambem pelo codigo: se o navegador abrir com uma folha de estilo antiga,
  // a janela continua flutuando onde o botao direito foi clicado.
  caixa.style.position = "fixed";
  caixa.style.zIndex = "20";
  caixa.hidden = false;
  const { innerWidth: w, innerHeight: h } = window;
  const r = caixa.getBoundingClientRect();
  caixa.style.left = `${Math.min(evento.clientX, w - r.width - 8)}px`;
  caixa.style.top = `${Math.min(evento.clientY, h - r.height - 8)}px`;
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
document.addEventListener("mousedown", (e) => {
  if (caixa && !caixa.hidden && !caixa.contains(e.target)) fechar();
});
