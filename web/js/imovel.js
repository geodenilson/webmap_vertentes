// Nivel do imovel do CAR: depois do municipio, o mapa abre um imovel com a imagem Planet de
// 09/2026 e a vegetacao mapeada, recortadas pelo imovel com 100 m de folga.
// A imagem vem de COG no Storage (bucket privado planet), lida no navegador pela biblioteca
// maplibre-cog-protocol; a mascara da faixa recorta todas as cenas de uma vez.
// O banco devolve tudo numa chamada: public.imovel_webmap(id), sql/18.

const COG = window.MaplibreCOGProtocol;
const CENA = "imovel_cena_";
const VEG = "imovel_vegetacao_";
const IDS = {
  vegetacao: "imovel_vegetacao",
  faixa: "imovel_faixa",
  limite: "imovel_limite",
};
const COR_VEGETACAO = "#1e8f3a";
// A vegetacao vem em COG de uma banda: 1 e vegetacao, 0 fica transparente.
const RGBA_VEGETACAO = [30, 143, 58, 120];
const COR_LIMITE = "#ffd21f";

let mapa = null;
let supabase = null;
let aoMudar = () => {};
let aoTrocar = () => {};
let atual = null;
let cenas = [];
let pedido = 0;

// A mascara da biblioteca e uma so para todas as camadas COG de uma copia. A imagem usa a
// faixa de 100 m e a vegetacao o limite exato do imovel, por isso a vegetacao vem de uma
// segunda copia da biblioteca, com estado proprio, no protocolo cogveg://.
const COPIA_VEGETACAO = "https://cdn.jsdelivr.net/npm/@geomatico/maplibre-cog-protocol@0.10.0/+esm";
let cogVeg = null;

async function segundaCopia() {
  if (cogVeg) return cogVeg;
  cogVeg = await import(COPIA_VEGETACAO);
  maplibregl.addProtocol("cogveg", async (params, abort) => {
    const resposta = await cogVeg.cogProtocol({ ...params, url: params.url.replace(/^cogveg:\/\//, "cog://") }, abort);
    if (resposta?.data?.tiles) resposta.data.tiles = resposta.data.tiles.map((t) => t.replace(/^cog:\/\//, "cogveg://"));
    return resposta;
  });
  return cogVeg;
}

export function iniciarImovel(opcoes) {
  ({ mapa, supabase } = opcoes);
  aoMudar = opcoes.aoMudar ?? aoMudar;
  aoTrocar = opcoes.aoTrocar ?? aoTrocar;
  if (COG && !iniciarImovel.protocolo) {
    maplibregl.addProtocol("cog", COG.cogProtocol);
    iniciarImovel.protocolo = true;
  }
}

export function imovelAtual() {
  return atual;
}

// Camadas do imovel no formato de camadas.js, para a legenda da tela e a do PDF.
export function camadasDoImovel() {
  if (!atual) return [];
  const lista = [{
    id: IDS.limite, titulo: "Imóvel do CAR", tipo: "line", geometria: "POLYGON",
    pintura: { "line-color": COR_LIMITE, "line-width": 3 },
    legenda: [["Limite do imóvel", COR_LIMITE]], fonte: "SICAR, imóvel do CAR, junho de 2026",
  }];
  if (mostrar.vegetacao && cenas.length) {
    lista.unshift({
      id: IDS.vegetacao, titulo: "Vegetação mapeada", tipo: "fill", geometria: "POLYGON", semConsulta: true,
      pintura: { "fill-color": COR_VEGETACAO, "fill-opacity": 0.47 },
      legenda: [["Vegetação mapeada", COR_VEGETACAO]],
      fonte: "Projeto Vertentes, vegetação mapeada sobre PlanetScope 09/2026",
    });
  }
  return lista;
}

export function fontesDoImovel() {
  return atual && mostrar.imagem && cenas.length ? ["Imagem: Planet Labs, PlanetScope, 09/2026"] : [];
}

export function textoImovel() {
  if (!atual) return "";
  return `Imóvel do CAR em ${atual.municipio}, ${numero(atual.area_ha, 1)} ha`;
}

const mostrar = { imagem: true, vegetacao: true };

function numero(v, casas = 0) {
  return Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function primeiraTematica() {
  // A imagem fica logo acima do preenchimento do nucleo, embaixo das camadas tematicas.
  const camadas = mapa.getStyle().layers;
  const i = camadas.findIndex((l) => l.id === "nucleos_malha_2025");
  return i >= 0 ? camadas[i + 1]?.id : undefined;
}

function primeiroRotulo() {
  return mapa.getStyle().layers.find((l) => l.id.endsWith("__rotulo") || l.id === "rotulos_uf")?.id;
}

// Com um imovel aberto, o preenchimento dos imoveis do CAR cobriria a imagem: fica so o
// contorno, e a opacidade volta ao fechar.
const CAR = "car_imovel_2026_06";
let opacidadeCar = null;

function esconderPreenchimentoCar() {
  if (!mapa.getLayer(CAR) || opacidadeCar !== null) return;
  opacidadeCar = mapa.getPaintProperty(CAR, "fill-opacity");
  mapa.setPaintProperty(CAR, "fill-opacity", 0);
}

function devolverPreenchimentoCar() {
  if (opacidadeCar === null) return;
  if (mapa.getLayer(CAR)) mapa.setPaintProperty(CAR, "fill-opacity", opacidadeCar);
  opacidadeCar = null;
}

function limpar() {
  devolverPreenchimentoCar();
  const ids = [...cenas.flatMap((c) => [CENA + c.cena, VEG + c.cena]), IDS.faixa, IDS.limite];
  for (const id of ids) {
    if (mapa.getLayer(id)) mapa.removeLayer(id);
    if (mapa.getSource(id)) mapa.removeSource(id);
  }
  cenas = [];
  COG?.clearMask?.();
  cogVeg?.clearMask?.();
}

export function fecharImovel() {
  pedido += 1;
  if (!atual) {
    desenharCartao();
    return;
  }
  limpar();
  atual = null;
  desenharCartao();
  aoTrocar();
  aoMudar();
}

export async function abrirImovel(id) {
  const meu = ++pedido;
  limpar();
  atual = null;
  desenharCartao("Abrindo o imóvel…");
  const { data, error } = await supabase.rpc("imovel_webmap", { id });
  if (meu !== pedido) return;
  if (error || !data) {
    console.error(error);
    desenharCartao("Não foi possível abrir este imóvel.");
    return;
  }
  atual = data;

  const faixa = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: data.faixa }] };
  const abaixo = primeiraTematica();
  const acima = primeiroRotulo();

  // Imagem e vegetacao: um link assinado por arquivo, valido por uma hora. A mascara da faixa
  // vale para todas as camadas COG e precisa estar antes de a fonte entrar no mapa.
  if (data.cenas.length && COG) {
    const caminhos = data.cenas.flatMap((c) => [c.arquivo, `vegetacao/${c.arquivo}`]);
    const [{ data: links, error: erroLinks }, veg2] = await Promise.all([
      supabase.storage.from("planet").createSignedUrls(caminhos, 3600),
      segundaCopia().catch((erro) => { console.error(erro); return null; }),
    ]);
    if (meu !== pedido) return;
    if (erroLinks) console.error(erroLinks);
    COG.setMask(faixa);
    veg2?.setMask({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: data.imovel }] });
    for (const [i, c] of data.cenas.entries()) {
      const imagem = links?.[2 * i]?.signedUrl;
      const veg = links?.[2 * i + 1]?.signedUrl;
      if (imagem) {
        mapa.addSource(CENA + c.cena, { type: "raster", url: `cog://${imagem}`, tileSize: 256 });
        mapa.addLayer({ id: CENA + c.cena, type: "raster", source: CENA + c.cena,
          layout: { visibility: mostrar.imagem ? "visible" : "none" } }, abaixo);
      }
      if (veg && veg2) {
        veg2.setColorFunction(veg, (pixel, cor) => cor.set(pixel[0] === 1 ? RGBA_VEGETACAO : [0, 0, 0, 0]));
        mapa.addSource(VEG + c.cena, { type: "raster", url: `cogveg://${veg}`, tileSize: 256 });
        mapa.addLayer({ id: VEG + c.cena, type: "raster", source: VEG + c.cena,
          layout: { visibility: mostrar.vegetacao ? "visible" : "none" } }, abaixo);
      }
      cenas.push(c);
    }
  }

  mapa.addSource(IDS.faixa, { type: "geojson", data: faixa });
  mapa.addLayer({
    id: IDS.faixa, type: "line", source: IDS.faixa,
    paint: { "line-color": "#ffffff", "line-width": 1.2, "line-dasharray": [3, 2], "line-opacity": 0.9 },
  }, acima);
  mapa.addSource(IDS.limite, { type: "geojson", data: { type: "Feature", properties: {}, geometry: data.imovel } });
  mapa.addLayer({
    id: IDS.limite, type: "line", source: IDS.limite,
    paint: { "line-color": COR_LIMITE, "line-width": 3 },
  }, acima);

  esconderPreenchimentoCar();
  const [o, s, l, n] = data.caixa;
  // O quadro do imovel fica no canto superior esquerdo do mapa: o enquadramento desvia dele.
  mapa.fitBounds([[o, s], [l, n]], { padding: { top: 40, bottom: 40, right: 40, left: 330 }, duration: 900 });
  desenharCartao();
  aoTrocar();
  aoMudar();
}

function alternarCamada(qual, ligar) {
  mostrar[qual] = ligar;
  const ids = cenas.map((c) => (qual === "imagem" ? CENA : VEG) + c.cena);
  for (const id of ids) {
    if (mapa.getLayer(id)) mapa.setLayoutProperty(id, "visibility", ligar ? "visible" : "none");
  }
  aoMudar();
}

const ROTULO_PASSIVO = { APP: "APP sem vegetação", RL: "Reserva legal sem vegetação", UR: "Uso restrito sem vegetação" };

function desenharCartao(mensagem) {
  const caixa = document.getElementById("cartao-imovel");
  if (!caixa) return;
  if (!atual) {
    caixa.hidden = !mensagem;
    caixa.innerHTML = mensagem ? `<p class="sub">${mensagem}</p>` : "";
    return;
  }
  const a = atual;
  const pct = a.area_ha ? (100 * a.veg_ha_imovel) / a.area_ha : 0;
  const passivo = Object.entries(a.passivo ?? {})
    .map(([classe, ha]) => `<tr><td>${ROTULO_PASSIVO[classe] ?? classe}</td><td>${numero(ha, 1)} ha</td></tr>`)
    .join("");
  const semImagem = a.cenas.length ? "" : '<p class="sub">Sem imagem Planet neste imóvel.</p>';
  caixa.hidden = false;
  caixa.innerHTML = `
    <div class="cabeca-imovel"><b>Imóvel do CAR</b>
      <button type="button" class="fechar" data-fechar-imovel title="Fechar o imóvel" aria-label="Fechar o imóvel">×</button></div>
    <table class="dados-imovel">
      <tr><td>Município</td><td>${a.municipio ?? ""}</td></tr>
      <tr><td>Área</td><td>${numero(a.area_ha, 1)} ha · ${numero(a.mod_fiscal, 1)} módulos fiscais</td></tr>
      <tr><td>Situação</td><td>${[a.status, a.condicao].filter(Boolean).join(" · ")}</td></tr>
      <tr><td>Vegetação mapeada</td><td><b>${numero(a.veg_ha_imovel, 1)} ha</b> · ${numero(pct, 1)}% do imóvel</td></tr>
      ${passivo}
    </table>
    ${semImagem}
    <label class="chave-imovel"><input type="checkbox" data-mostrar="imagem" ${mostrar.imagem ? "checked" : ""} ${a.cenas.length ? "" : "disabled"}>
      Imagem Planet, 09/2026</label>
    <label class="chave-imovel"><input type="checkbox" data-mostrar="vegetacao" ${mostrar.vegetacao ? "checked" : ""}>
      Vegetação mapeada</label>
    <p class="sub">Temas e vegetação recortados pelo imóvel; imagem com 100 m de folga.</p>`;
  caixa.querySelector("[data-fechar-imovel]").addEventListener("click", () => fecharImovel());
  caixa.querySelectorAll("[data-mostrar]").forEach((c) => {
    c.addEventListener("change", (e) => alternarCamada(e.target.dataset.mostrar, e.target.checked));
  });
}
