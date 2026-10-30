// Exporta a vista do mapa numa folha A4 deitada, no layout da colecao de mapas:
// mapa na folha inteira, mapinhas de localizacao no alto a esquerda, titulo no alto,
// norte no alto a direita, escala embaixo a esquerda, legenda em colunas embaixo a direita
// e fonte abaixo do quadro.

import { itensLegenda, misturarComBranco, comClassesPresentes, corDaClasse, amostraDe } from "./legenda.js";
import { ROTULO_CLASSE } from "./camadas.js";

const FOLHA = { largura: 297, altura: 210 };
const QUADRO = { x: 8, y: 8, largura: 281, altura: 186 };
const RODAPE_Y = 199;
// Tamanho, em pixels de tela, em que o mapa e redesenhado para a foto. Mantem a proporcao do
// quadro; com pixelRatio 2 a imagem sai com cerca de 250 dpi no papel.
const FOTO = { largura: 1405, pixelRatio: 2 };
FOTO.altura = Math.round(FOTO.largura * QUADRO.altura / QUADRO.largura);

// Mapinhas de localizacao, nas medidas da colecao.
const MAPINHA = { y: 15, largura: 40, altura: 36 };
const MAPINHA_BRASIL_X = 11.5;
const MAPINHA_NUCLEOS_X = MAPINHA_BRASIL_X + MAPINHA.largura + 3;

// Uma coluna pode ir ate 64 mm: ao lado do nucleo sempre sobra espaco. Com duas colunas ou
// mais, a altura cai 30% e o mapa se afasta ate a legenda sair de cima do desenho.
const LEGENDA = {
  alturaMaxima: 64, reducaoComColunas: 0.7, larguraMaxima: 54,
  folga: 3, linha: 3.4, fonte: 6.6, recuoClasse: 3, amostra: 7,
};
const AFASTAR = { passo: 0.2, maximo: 6 };

const VERDE = [31, 94, 46];
const TEXTO = [43, 43, 43];
const SUAVE = [111, 106, 96];
const DESTAQUE = [193, 68, 14];
const FUNDO_UF = [228, 224, 214];
const NUCLEO_CLARO = [207, 224, 195];
const NUCLEO_LINHA = [74, 117, 64];

function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function opacidade(doc, valor) {
  doc.setGState(new doc.GState({ opacity: valor, "stroke-opacity": valor }));
}

// Foto do mapa ---------------------------------------------------------------

// O evento idle as vezes nao chega quando um tile pesado demora ou falha no banco; por
// isso a espera confere o estado do mapa. Tile com erro conta como terminado.
function esperarDesenho(map, limite = 30000) {
  return new Promise((resolve) => {
    const inicio = performance.now();
    const conferir = () => {
      const pronto = map.loaded() && !map.isMoving();
      if (pronto || performance.now() - inicio > limite) {
        map.once("render", () => resolve(pronto));
        map.triggerRepaint();
        return;
      }
      setTimeout(conferir, 200);
    };
    map.triggerRepaint();
    setTimeout(conferir, 300);
  });
}

// Redesenha o mapa no tamanho da folha, deixa preparar() conferir as camadas e ajustar o
// zoom, tira a foto e devolve o mapa da tela como estava.
async function fotografar(map, preparar, enquadrar = null) {
  const caixa = map.getContainer();
  const limites = map.getBounds();
  const camera = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  const estilo = caixa.getAttribute("style") || "";

  caixa.classList.add("exportando");
  caixa.style.width = `${FOTO.largura}px`;
  caixa.style.height = `${FOTO.altura}px`;
  map.setPixelRatio(FOTO.pixelRatio);
  map.resize();
  if (enquadrar) map.fitBounds(enquadrar.limites, { duration: 0, padding: enquadrar.padding });
  else map.fitBounds(limites, { duration: 0, padding: 0 });
  await esperarDesenho(map);

  try {
    const extra = await preparar(map);
    const imagem = map.getCanvas().toDataURL("image/jpeg", 0.92);
    return { imagem, centro: map.getCenter(), zoom: map.getZoom(), ...extra };
  } finally {
    caixa.classList.remove("exportando");
    caixa.setAttribute("style", estilo);
    map.setPixelRatio(window.devicePixelRatio || 1);
    map.resize();
    map.jumpTo(camera);
  }
}

// Camadas que de fato desenham alguma coisa no recorte da foto. Com um nucleo escolhido,
// a camada ligada que nao tem nada nesse nucleo fica fora da legenda.
function subcamadas(map, camada) {
  return [camada.id, `${camada.id}__contorno`, `${camada.id}__ponto`].filter((id) => map.getLayer(id));
}

// Cada camada presente ja volta com a legenda reduzida as classes que aparecem na foto.
function camadasPresentes(map, camadas) {
  const lista = [];
  for (const camada of camadas) {
    // Raster (vegetacao do imovel) nao tem feicao para consultar: entra como esta.
    if (camada.semConsulta) {
      lista.push(camada);
      continue;
    }
    const ids = subcamadas(map, camada);
    const feicoes = ids.length ? map.queryRenderedFeatures({ layers: ids }) : [];
    if (feicoes.length) lista.push(comClassesPresentes(camada, feicoes));
  }
  return lista;
}

// Caixa da legenda em pixels da foto, para saber se ela cobre o desenho.
function legendaEmPixels(caixa) {
  const k = FOTO.largura / QUADRO.largura;
  return [
    [(caixa.x - QUADRO.x) * k, (caixa.y - QUADRO.y) * k],
    [(caixa.x + caixa.largura - QUADRO.x) * k, (caixa.y + caixa.altura - QUADRO.y) * k],
  ];
}

function legendaCobreODesenho(map, caixa, presentes) {
  // O alvo e o nucleo, quando ligado; senao, as camadas tematicas presentes.
  const nucleo = presentes.find((c) => c.id === "nucleos_malha_2025");
  const alvos = nucleo ? [nucleo] : presentes.filter((c) => !c.contexto);
  const ids = alvos.flatMap((c) => subcamadas(map, c));
  if (!ids.length) return false;
  return map.queryRenderedFeatures(legendaEmPixels(caixa), { layers: ids }).length > 0;
}

// Escala e norte -------------------------------------------------------------

function escalaBonita(metros) {
  const potencia = 10 ** Math.floor(Math.log10(metros));
  for (const passo of [5, 2, 1]) {
    if (passo * potencia <= metros) return passo * potencia;
  }
  return potencia;
}

function desenharEscala(doc, centro, zoom) {
  // Metros por pixel de tela no centro da vista, com tile de 512 px do MapLibre.
  const metrosPorPixel = 40075016.686 * Math.cos(centro.lat * Math.PI / 180) / (512 * 2 ** zoom);
  const metrosPorMm = metrosPorPixel * FOTO.largura / QUADRO.largura;
  const comprimento = escalaBonita(metrosPorMm * 45);
  const mm = comprimento / metrosPorMm;
  const x = QUADRO.x + 6;
  const y = QUADRO.y + QUADRO.altura - 8;

  const rotulo = comprimento >= 1000 ? `${(comprimento / 1000).toLocaleString("pt-BR")} km` : `${comprimento} m`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  const meioRotulo = doc.getTextWidth(rotulo) / 2;

  opacidade(doc, 0.85);
  doc.setFillColor(255, 255, 255);
  doc.rect(x - 3, y - 5, mm + meioRotulo + 6, 9, "F");
  opacidade(doc, 1);
  doc.setDrawColor(...TEXTO);
  doc.setLineWidth(0.2);
  for (let i = 0; i < 4; i += 1) {
    doc.setFillColor(...(i % 2 ? [255, 255, 255] : TEXTO));
    doc.rect(x + (mm / 4) * i, y, mm / 4, 1.5, "FD");
  }
  doc.setTextColor(...TEXTO);
  doc.text("0", x, y - 1, { align: "center" });
  doc.text(rotulo, x + mm, y - 1, { align: "center" });
}

function desenharNorte(doc) {
  const cx = QUADRO.x + QUADRO.largura - 12;
  const cy = QUADRO.y + 13;
  opacidade(doc, 0.85);
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, 7, "F");
  opacidade(doc, 1);
  doc.setFillColor(...TEXTO);
  doc.triangle(cx, cy - 5, cx - 2.6, cy + 2.8, cx, cy + 1.4, "F");
  doc.setFillColor(170, 165, 155);
  doc.triangle(cx, cy - 5, cx + 2.6, cy + 2.8, cx, cy + 1.4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXTO);
  doc.text("N", cx, cy + 6.2, { align: "center" });
}

// Mapinhas de localizacao ----------------------------------------------------

function mercatorY(lat) {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}

function aneis(geometria) {
  if (!geometria) return [];
  if (geometria.type === "Polygon") return geometria.coordinates;
  if (geometria.type === "MultiPolygon") return geometria.coordinates.flat();
  return [];
}

function extensao(geometrias, margem = 0) {
  let [o, s, l, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const g of geometrias) {
    for (const anel of aneis(g)) {
      for (const [x, y] of anel) {
        o = Math.min(o, x); l = Math.max(l, x); s = Math.min(s, y); n = Math.max(n, y);
      }
    }
  }
  const dx = (l - o) * margem;
  const dy = (n - s) * margem;
  return { oeste: o - dx, leste: l + dx, sul: s - dy, norte: n + dy };
}

// Projecao para dentro da caixa do mapinha, mantendo a proporcao e centrando.
function projetor(caixa, ext) {
  const yN = mercatorY(ext.norte);
  const yS = mercatorY(ext.sul);
  const largura = (ext.leste - ext.oeste) * Math.PI / 180;
  const altura = yN - yS;
  const escala = Math.min((caixa.largura - 3) / largura, (caixa.altura - 3) / altura);
  const sobraX = (caixa.largura - largura * escala) / 2;
  const sobraY = (caixa.altura - altura * escala) / 2;
  return ([lon, lat]) => [
    caixa.x + sobraX + ((lon - ext.oeste) * Math.PI / 180) * escala,
    caixa.y + sobraY + (yN - mercatorY(lat)) * escala,
  ];
}

function desenharGeometria(doc, geometria, projetar, estilo) {
  const lista = aneis(geometria);
  if (!lista.length) return;
  for (const anel of lista) {
    anel.forEach((ponto, i) => {
      const [x, y] = projetar(ponto);
      if (i === 0) doc.moveTo(x, y); else doc.lineTo(x, y);
    });
    doc.close();
  }
  if (estilo.preenchimento) doc.setFillColor(...estilo.preenchimento);
  if (estilo.linha) {
    doc.setDrawColor(...estilo.linha);
    doc.setLineWidth(estilo.espessura ?? 0.15);
  }
  if (estilo.preenchimento && estilo.linha) doc.fillStrokeEvenOdd();
  else if (estilo.preenchimento) doc.fillEvenOdd();
  else doc.stroke();
}

function moldura(doc, caixa, rotulo) {
  opacidade(doc, 0.92);
  doc.setFillColor(250, 248, 243);
  doc.rect(caixa.x, caixa.y, caixa.largura, caixa.altura, "F");
  opacidade(doc, 1);
  doc.setDrawColor(200, 194, 182);
  doc.setLineWidth(0.25);
  doc.rect(caixa.x, caixa.y, caixa.largura, caixa.altura);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...SUAVE);
  opacidade(doc, 0.85);
  doc.setFillColor(255, 255, 255);
  const largura = doc.getTextWidth(rotulo) + 3;
  doc.rect(caixa.x + caixa.largura / 2 - largura / 2, caixa.y - 4.2, largura, 3.6, "F");
  opacidade(doc, 1);
  doc.text(rotulo, caixa.x + caixa.largura / 2, caixa.y - 1.4, { align: "center" });
}

function comRecorte(doc, caixa, desenhar) {
  doc.saveGraphicsState();
  doc.rect(caixa.x, caixa.y, caixa.largura, caixa.altura, null);
  doc.clip();
  doc.discardPath();
  desenhar();
  doc.restoreGraphicsState();
}

// Terceiro mapinha, so com um municipio escolhido: os municipios do nucleo, o escolhido em
// destaque. Fica embaixo do "No Brasil", do mesmo tamanho.
function desenharMapinhaMunicipios(doc, municipios, municipioAtual) {
  if (!municipioAtual || !municipios?.length) return;
  const caixa = { x: MAPINHA_BRASIL_X, y: MAPINHA.y + MAPINHA.altura + 7, largura: MAPINHA.largura, altura: MAPINHA.altura };
  moldura(doc, caixa, "No núcleo");
  const noNucleo = projetor(caixa, extensao(municipios.map((m) => m.geometria), 0.05));
  comRecorte(doc, caixa, () => {
    for (const m of municipios) {
      const escolhido = m.cd_mun === municipioAtual;
      if (escolhido) continue;
      desenharGeometria(doc, m.geometria, noNucleo, { preenchimento: NUCLEO_CLARO, linha: NUCLEO_LINHA, espessura: 0.12 });
    }
    for (const m of municipios.filter((x) => x.cd_mun === municipioAtual)) {
      desenharGeometria(doc, m.geometria, noNucleo, { preenchimento: DESTAQUE, linha: [124, 43, 8], espessura: 0.2 });
    }
  });
}

// Quarto mapinha, so com um imovel aberto: o municipio e o imovel em destaque. Fica embaixo
// do "No núcleo". Imovel pequeno demais para se ver no mapinha ganha um circulo em volta.
const MAPINHA_MUNICIPIO_Y = MAPINHA.y + 2 * (MAPINHA.altura + 7);

function desenharMapinhaImovel(doc, municipios, municipioAtual, imovel) {
  const municipio = municipios?.find((m) => m.cd_mun === municipioAtual);
  if (!imovel?.imovel || !municipio) return;
  const caixa = { x: MAPINHA_BRASIL_X, y: MAPINHA_MUNICIPIO_Y, largura: MAPINHA.largura, altura: MAPINHA.altura };
  moldura(doc, caixa, "No município");
  const projetar = projetor(caixa, extensao([municipio.geometria], 0.05));
  comRecorte(doc, caixa, () => {
    desenharGeometria(doc, municipio.geometria, projetar, { preenchimento: NUCLEO_CLARO, linha: NUCLEO_LINHA, espessura: 0.2 });
    desenharGeometria(doc, imovel.imovel, projetar, { preenchimento: DESTAQUE, linha: [124, 43, 8], espessura: 0.15 });
    const e = extensao([imovel.imovel]);
    const [x1, y1] = projetar([e.oeste, e.norte]);
    const [x2, y2] = projetar([e.leste, e.sul]);
    if (Math.max(x2 - x1, y2 - y1) < 2.5) {
      doc.setDrawColor(...DESTAQUE);
      doc.setLineWidth(0.35);
      doc.circle((x1 + x2) / 2, (y1 + y2) / 2, 2, "S");
    }
  });
}

// Com um imovel aberto, a foto enquadra o imovel deixando livre a coluna dos mapinhas, a
// esquerda, e a faixa do titulo, no alto.
function enquadramentoDoImovel(imovel) {
  if (!imovel?.caixa) return null;
  const k = FOTO.largura / QUADRO.largura;
  const [o, s, l, n] = imovel.caixa;
  const esquerda = (MAPINHA_BRASIL_X + MAPINHA.largura + 4 - QUADRO.x) * k;
  return {
    limites: [[o, s], [l, n]],
    padding: { left: esquerda, right: 22 * k, top: 24 * k, bottom: 14 * k },
  };
}

function desenharMapinhas(doc, contornos, nucleoAtual) {
  if (!contornos) return;
  const estados = contornos.estados ?? [];
  const nucleos = contornos.nucleos ?? [];

  const brasil = { x: MAPINHA_BRASIL_X, y: MAPINHA.y, largura: MAPINHA.largura, altura: MAPINHA.altura };
  moldura(doc, brasil, "No Brasil");
  const noBrasil = projetor(brasil, extensao(estados.map((e) => e.geometria)));
  comRecorte(doc, brasil, () => {
    for (const e of estados) {
      desenharGeometria(doc, e.geometria, noBrasil, { preenchimento: FUNDO_UF, linha: [255, 255, 255], espessura: 0.15 });
    }
    for (const n of nucleos) {
      const escolhido = nucleoAtual === null || n.nucleo === nucleoAtual;
      desenharGeometria(doc, n.geometria, noBrasil, {
        preenchimento: escolhido ? DESTAQUE : NUCLEO_LINHA, linha: null,
      });
    }
  });

  if (nucleoAtual === null) return;

  const caixa = { x: MAPINHA_NUCLEOS_X, y: MAPINHA.y, largura: MAPINHA.largura, altura: MAPINHA.altura };
  moldura(doc, caixa, "Nos núcleos");
  const nosNucleos = projetor(caixa, extensao(nucleos.map((n) => n.geometria), 0.06));
  comRecorte(doc, caixa, () => {
    for (const e of estados) {
      desenharGeometria(doc, e.geometria, nosNucleos, { preenchimento: FUNDO_UF, linha: [255, 255, 255], espessura: 0.25 });
    }
    for (const n of nucleos) {
      const escolhido = n.nucleo === nucleoAtual;
      desenharGeometria(doc, n.geometria, nosNucleos, {
        preenchimento: escolhido ? DESTAQUE : NUCLEO_CLARO,
        linha: escolhido ? [124, 43, 8] : NUCLEO_LINHA,
        espessura: 0.2,
      });
    }
  });
}

// Titulo ---------------------------------------------------------------------

// Titulo e subtitulo centrados entre si. O bloco fica centrado na folha quando cabe;
// senao, encostado logo depois dos mapinhas.
function desenharTitulo(doc, titulo, recorte, nucleoAtual) {
  const inicio = (nucleoAtual === null ? MAPINHA_BRASIL_X : MAPINHA_NUCLEOS_X) + MAPINHA.largura + 6;
  const fim = QUADRO.x + QUADRO.largura - 24;
  const centroFolha = FOLHA.largura / 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const linhas = doc.splitTextToSize(titulo, fim - inicio);
  const larguraTitulo = Math.max(...linhas.map((l) => doc.getTextWidth(l)));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const larguraRecorte = doc.getTextWidth(recorte);
  const largura = Math.max(larguraTitulo, larguraRecorte);

  const cabe = centroFolha - largura / 2 >= inicio && centroFolha + largura / 2 <= fim;
  const centro = cabe ? centroFolha : inicio + largura / 2;
  const altura = 6 * linhas.length + 4.5;

  opacidade(doc, 0.85);
  doc.setFillColor(255, 255, 255);
  doc.rect(centro - largura / 2 - 3, QUADRO.y + 3.5, largura + 6, altura, "F");
  opacidade(doc, 1);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...VERDE);
  linhas.forEach((linha, i) => doc.text(linha, centro, QUADRO.y + 9.5 + i * 6, { align: "center" }));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...SUAVE);
  doc.text(recorte, centro, QUADRO.y + 9.5 + linhas.length * 6 - 1.2, { align: "center" });
}

// Legenda --------------------------------------------------------------------

// Retangulo para poligono, vazado quando a camada so tem contorno; traco para linha;
// ponto para ponto.
function amostra(doc, x, y, item) {
  if (item.simbolo === "linha") {
    doc.setDrawColor(...rgb(item.cor));
    doc.setLineWidth(0.8);
    doc.line(x, y, x + 5, y);
    return;
  }
  if (item.simbolo === "ponto") {
    doc.setFillColor(...rgb(item.cor));
    doc.circle(x + 2.5, y, 1.1, "F");
    return;
  }
  doc.setDrawColor(...rgb(item.borda));
  if (item.preenchimento) {
    doc.setFillColor(...misturarComBranco(item.preenchimento, item.opacidade ?? 1));
    doc.setLineWidth(0.3);
    doc.rect(x, y - 1.6, 5, 3.2, "FD");
  } else {
    doc.setLineWidth(0.5);
    doc.rect(x, y - 1.6, 5, 3.2, "S");
  }
}

// Monta as colunas. Uma camada que cabe inteira numa coluna nunca se parte: se nao cabe no
// que sobra, passa toda para a coluna seguinte. So a camada mais alta que a coluna se
// divide, e ai o titulo nunca fica sozinho no pe. As classes ficam recuadas sob o titulo.
function medirGrupo(doc, camada, primeiro) {
  return itensLegenda(camada).map((item, i) => {
    doc.setFont("helvetica", item.tipo === "titulo" ? "bold" : "normal");
    doc.setFontSize(LEGENDA.fonte);
    const recuoSimbolo = item.nivel ? LEGENDA.recuoClasse : 0;
    const recuoTexto = item.tipo === "titulo" ? 0 : recuoSimbolo + LEGENDA.amostra;
    const linhas = doc.splitTextToSize(item.texto, LEGENDA.larguraMaxima - recuoTexto);
    const largura = recuoTexto + Math.max(...linhas.map((l) => doc.getTextWidth(l)));
    // Respiro antes de cada camada: maior antes de um titulo de camada com classes.
    const espacoAntes = i === 0 && !primeiro ? (item.tipo === "titulo" ? 1.8 : 0.6) : 0;
    return {
      ...item, linhas, largura, recuoSimbolo, recuoTexto,
      altura: linhas.length * LEGENDA.linha + espacoAntes, espacoAntes,
    };
  });
}

function semRespiro(item) {
  return { ...item, altura: item.altura - item.espacoAntes, espacoAntes: 0 };
}

function montarColunas(doc, camadas, alturaMaxima) {
  const colunas = [[]];
  let altura = 0;
  const novaColuna = () => { colunas.push([]); altura = 0; };

  camadas.forEach((camada, c) => {
    const grupo = medirGrupo(doc, camada, c === 0);
    const alturaGrupo = grupo.reduce((s, i) => s + i.altura, 0) - grupo[0].espacoAntes;
    const atual = colunas[colunas.length - 1];

    if (alturaGrupo <= alturaMaxima) {
      if (atual.length && altura + grupo.reduce((s, i) => s + i.altura, 0) > alturaMaxima) novaColuna();
      grupo.forEach((item, i) => {
        const pronto = i === 0 && !colunas[colunas.length - 1].length ? semRespiro(item) : item;
        colunas[colunas.length - 1].push(pronto);
        altura += pronto.altura;
      });
      return;
    }

    grupo.forEach((item, i) => {
      const proximo = grupo[i + 1];
      const precisa = item.tipo === "titulo" && proximo ? item.altura + proximo.altura : item.altura;
      let pronto = item;
      if (altura + precisa > alturaMaxima && colunas[colunas.length - 1].length) {
        novaColuna();
        pronto = semRespiro(item);
      }
      colunas[colunas.length - 1].push(pronto);
      altura += pronto.altura;
    });
  });
  return colunas.filter((c) => c.length).map((col) => ({
    itens: col,
    largura: Math.max(...col.map((i) => i.largura)),
    altura: col.reduce((s, i) => s + i.altura, 0),
  }));
}

const SEPARACAO = 5;
const CABECALHO = 5;
const NOTA = { altura: 4.6, fonte: 5.8 };

// Referencia no pe da legenda (a imagem Planet do imovel). Medida uma vez por folha.
let notaLegenda = null;

function caixaDaLegenda(colunas) {
  const larguraColunas = colunas.reduce((s, c) => s + c.largura, 0) + SEPARACAO * (colunas.length - 1);
  const largura = Math.max(larguraColunas, notaLegenda?.largura ?? 0) + 2 * LEGENDA.folga;
  const altura = Math.max(...colunas.map((c) => c.altura)) + CABECALHO + 2 * LEGENDA.folga
    + (notaLegenda ? NOTA.altura : 0);
  const direita = QUADRO.x + QUADRO.largura - 3;
  const base = QUADRO.y + QUADRO.altura - 3;
  return { x: direita - largura, y: base - altura, largura, altura };
}

function desenharLegenda(doc, colunas) {
  if (!colunas.length) return;
  const caixa = caixaDaLegenda(colunas);

  opacidade(doc, 0.92);
  doc.setFillColor(255, 255, 255);
  doc.rect(caixa.x, caixa.y, caixa.largura, caixa.altura, "F");
  opacidade(doc, 1);
  doc.setDrawColor(200, 194, 182);
  doc.setLineWidth(0.25);
  doc.rect(caixa.x, caixa.y, caixa.largura, caixa.altura);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...VERDE);
  doc.text("Legenda", caixa.x + LEGENDA.folga, caixa.y + LEGENDA.folga + 2.6);

  let x = caixa.x + LEGENDA.folga;
  for (const coluna of colunas) {
    let y = caixa.y + LEGENDA.folga + CABECALHO + 2.4;
    for (const item of coluna.itens) {
      y += item.espacoAntes;
      doc.setFontSize(LEGENDA.fonte);
      doc.setTextColor(...TEXTO);
      if (item.tipo === "titulo") {
        doc.setFont("helvetica", "bold");
        doc.text(item.linhas, x, y);
      } else {
        doc.setFont("helvetica", "normal");
        amostra(doc, x + item.recuoSimbolo, y - 1, item);
        doc.text(item.linhas, x + item.recuoTexto, y);
      }
      y += item.linhas.length * LEGENDA.linha;
    }
    x += coluna.largura + SEPARACAO;
  }
  if (notaLegenda) {
    const yNota = caixa.y + caixa.altura - LEGENDA.folga - 0.6;
    doc.setDrawColor(222, 216, 204);
    doc.setLineWidth(0.15);
    doc.line(caixa.x + LEGENDA.folga, yNota - 3.4, caixa.x + caixa.largura - LEGENDA.folga, yNota - 3.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(NOTA.fonte);
    doc.setTextColor(...SUAVE);
    doc.text(notaLegenda.texto, caixa.x + LEGENDA.folga, yNota);
  }
}

// Confere as camadas no recorte da foto e arruma a legenda. Com uma coluna, nada muda.
// Com duas ou mais, a altura cai 30% e o mapa se afasta aos poucos ate a legenda sair de
// cima do desenho, no maximo 1,2 nivel de zoom.
async function arrumarLegenda(doc, map, camadas) {
  let presentes = camadasPresentes(map, camadas);
  let colunas = montarColunas(doc, presentes, LEGENDA.alturaMaxima);
  if (colunas.length <= 1) return { presentes, colunas };

  const baixa = LEGENDA.alturaMaxima * LEGENDA.reducaoComColunas;
  colunas = montarColunas(doc, presentes, baixa);
  // Abaixo do nivel inteiro atual o mapa pede todos os tiles de novo, e os de zoom baixo
  // das camadas pesadas levam muito tempo no banco. O afastamento para nesse piso.
  const piso = Math.floor(map.getZoom()) + 0.001;
  for (let i = 0; i < AFASTAR.maximo && legendaCobreODesenho(map, caixaDaLegenda(colunas), presentes); i += 1) {
    const zoom = Math.max(piso, map.getZoom() - AFASTAR.passo);
    if (zoom >= map.getZoom()) break;
    map.setZoom(zoom);
    if (!(await esperarDesenho(map, 15000))) break;
  }
  presentes = camadasPresentes(map, camadas);
  colunas = montarColunas(doc, presentes, baixa);
  return { presentes, colunas };
}

// Pagina de informacoes ------------------------------------------------------
// Um cartao por camada escolhida: totais, grafico por classe com as cores do mapa e os
// maiores pelo nome. Os cartoes vao em tres colunas, cada um na coluna mais curta; o que
// nao cabe abre uma pagina de continuacao.

const INFO = { x: 10, topo: 27, base: 190, colunas: 3, separacao: 8 };
INFO.largura = (FOLHA.largura - 2 * INFO.x - (INFO.colunas - 1) * INFO.separacao) / INFO.colunas;

function numero(valor, casas = 0) {
  return Number(valor ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function encurtar(doc, texto, largura) {
  if (doc.getTextWidth(texto) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function valorDaLinha(item, unidade) {
  if (unidade === "ha") return `${numero(item.medida)} ha`;
  if (unidade === "km") return `${numero(item.medida, 1)} km`;
  return `${numero(item.feicoes)}`;
}

function totais(r) {
  const feicoes = `${numero(r.feicoes)} ${r.unidade ? "feições" : "pontos"}`;
  if (r.unidade === "ha") {
    const pct = r.area_recorte ? (100 * r.medida) / r.area_recorte : null;
    let parte = "";
    if (pct !== null && pct > 0 && pct < 0.1) parte = " (menos de 0,1% do recorte)";
    else if (pct !== null && pct <= 100) parte = ` (${numero(pct, 1)}% do recorte)`;
    return `${feicoes} · ${numero(r.medida)} ha${parte}`;
  }
  if (r.unidade === "km") return `${feicoes} · ${numero(r.medida, 1)} km`;
  return feicoes;
}

const ORIGEM = {
  "base oficial": "Medida: campo de área ou comprimento no núcleo, na base oficial",
  "medida no recorte": "Medida: calculada na parte dentro do recorte",
  "medida na cópia do mapa": "Medida: calculada na cópia do mapa",
};

// Anos (PRODES) vao em ordem cronologica; classes que estao todas na legenda (faixas de
// modulo fiscal) seguem a ordem dela; as demais, da maior para a menor.
function emOrdem(camada, classes, rotulos) {
  if (classes.every((c) => /^\d{4}$/.test(String(c.classe)))) {
    return [...classes].sort((a, b) => Number(a.classe) - Number(b.classe));
  }
  const ordem = camada.legenda.map(([rotulo]) => rotulo);
  const posicao = (c) => ordem.indexOf(rotulos[c.classe] ?? c.classe);
  if (classes.every((c) => posicao(c) >= 0)) return [...classes].sort((a, b) => posicao(a) - posicao(b));
  return classes;
}

function alturaDoCartao(r, modo) {
  if (!r) return 15;
  let h = 15;
  if (modo !== "numeros" && r.classes?.length) h += 5 + r.classes.length * 4.6;
  if (modo === "completo" && r.maiores?.length) h += 6 + r.maiores.length * 3.7;
  return h + 2;
}

function desenharCartao(doc, x, y, { camada, modo, campos, resumo: r }) {
  const largura = INFO.largura;
  const altura = alturaDoCartao(r, modo);

  doc.setDrawColor(216, 210, 198);
  doc.setLineWidth(0.25);
  doc.setFillColor(252, 251, 248);
  doc.roundedRect(x, y, largura, altura, 1.5, 1.5, "FD");

  // Titulo com o simbolo da camada.
  const simbolo = amostraDe(camada, camada.legenda[0][1]);
  amostra(doc, x + 3, y + 5, { ...simbolo, cor: simbolo.cor ?? camada.legenda[0][1] });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.6);
  doc.setTextColor(...VERDE);
  doc.text(encurtar(doc, camada.titulo, largura - 13), x + 10, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(...TEXTO);
  if (!r) {
    doc.setTextColor(...SUAVE);
    doc.text(doc.splitTextToSize("O banco não respondeu a tempo para esta camada. Exporte de novo em instantes.", largura - 6), x + 3, y + 10.6);
    return;
  }
  doc.text(encurtar(doc, totais(r), largura - 6), x + 3, y + 10.6);
  doc.setFontSize(5.8);
  doc.setTextColor(...SUAVE);
  doc.text(ORIGEM[r.origem] ?? `Medida: ${r.origem}`, x + 3, y + 13.6);

  let cy = y + 15;

  if (modo !== "numeros" && r.classes?.length) {
    cy += 3.6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.setTextColor(...SUAVE);
    const porAno = r.classes.every((c) => /^\d{4}$/.test(String(c.classe)));
    const cabeca = porAno
      ? (r.classes.length >= 10 ? "Por ano, os dez de maior área" : "Por ano")
      : (r.unidade ? "Por classe" : "Por classe, número de pontos");
    doc.text(cabeca, x + 3, cy);
    cy += 1.6;
    const rotuloL = 30;
    const valorL = 17;
    const barraL = largura - 6 - rotuloL - valorL - 2;
    const chave = r.unidade ? "medida" : "feicoes";
    const maior = Math.max(...r.classes.map((c) => Number(c[chave]) || 0), 1);
    const rotulos = ROTULO_CLASSE[camada.id] ?? {};
    for (const c of emOrdem(camada, r.classes, rotulos)) {
      const texto = rotulos[c.classe] ?? c.classe;
      const cor = corDaClasse(camada, campos.classe, c.classe) ?? "#8aa37a";
      const comprimento = Math.max(0.4, (barraL * (Number(c[chave]) || 0)) / maior);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.3);
      doc.setTextColor(...TEXTO);
      doc.text(encurtar(doc, texto, rotuloL - 1), x + 3, cy + 2.9);
      doc.setFillColor(...rgb(cor));
      doc.setDrawColor(150, 145, 135);
      doc.setLineWidth(0.1);
      doc.rect(x + 3 + rotuloL, cy + 0.6, comprimento, 3, "FD");
      doc.setTextColor(...SUAVE);
      doc.text(valorDaLinha(c, r.unidade), x + largura - 3, cy + 2.9, { align: "right" });
      cy += 4.6;
    }
  }

  if (modo === "completo" && r.maiores?.length) {
    cy += 3.8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.setTextColor(...SUAVE);
    doc.text(r.unidade ? "Maiores no recorte" : "Mais frequentes no recorte", x + 3, cy);
    cy += 1;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    r.maiores.forEach((m, i) => {
      cy += 3.7;
      doc.setTextColor(...TEXTO);
      doc.text(encurtar(doc, `${i + 1}. ${m.nome}`, largura - 26), x + 3, cy);
      doc.setTextColor(...SUAVE);
      doc.text(valorDaLinha(m, r.unidade), x + largura - 3, cy, { align: "right" });
    });
  }
}

// Primeiro cartao no nivel do imovel: os dados do quadro do imovel na tela.
const ROTULO_PASSIVO = { APP: "APP sem vegetação", RL: "Reserva legal sem vegetação", UR: "Uso restrito sem vegetação" };

function linhasDoImovel(a) {
  const pct = a.area_ha ? (100 * (a.veg_ha_imovel ?? 0)) / a.area_ha : 0;
  return [
    ["Código do imóvel", a.cod_imovel ?? "sem código"],
    ["Município", a.municipio ?? ""],
    ["Área", `${numero(a.area_ha, 1)} ha`],
    ["Módulos fiscais", numero(a.mod_fiscal, 1)],
    ["Situação", [a.status, a.condicao].filter(Boolean).join(" · ")],
    ["Vegetação mapeada", `${numero(a.veg_ha_imovel, 1)} ha · ${numero(pct, 1)}% do imóvel`],
    ...Object.entries(a.passivo ?? {}).map(([classe, ha]) => [ROTULO_PASSIVO[classe] ?? classe, `${numero(ha, 1)} ha`]),
    ["Imagem", a.cenas?.length ? "Planet, PlanetScope, 09/2026" : "sem imagem Planet"],
  ];
}

// Coluna dos rotulos na largura do maior; o valor quebra em mais linhas se precisar (o
// codigo do CAR e longo e sem espaco).
function medirCartaoImovel(doc, a) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  const linhas = linhasDoImovel(a);
  const colRotulo = Math.max(...linhas.map(([r]) => doc.getTextWidth(r))) + 3;
  const larguraValor = INFO.largura - 6 - colRotulo;
  const partes = linhas.map(([rotulo, valor]) => [rotulo, doc.splitTextToSize(String(valor), larguraValor)]);
  const altura = 12 + partes.reduce((s, [, v]) => s + v.length * 3.2 + 1.2, 0);
  return { partes, colRotulo, altura };
}

function alturaDoCartaoImovel(doc, a) {
  return medirCartaoImovel(doc, a).altura;
}

function desenharCartaoImovel(doc, x, y, a) {
  const largura = INFO.largura;
  const { partes, colRotulo, altura } = medirCartaoImovel(doc, a);
  doc.setDrawColor(216, 210, 198);
  doc.setLineWidth(0.25);
  doc.setFillColor(252, 251, 248);
  doc.roundedRect(x, y, largura, altura, 1.5, 1.5, "FD");
  doc.setDrawColor(255, 210, 31);
  doc.setLineWidth(0.9);
  doc.rect(x + 3, y + 3.4, 5, 3.2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.6);
  doc.setTextColor(...VERDE);
  doc.text("Imóvel do CAR", x + 10, y + 6);
  let cy = y + 11.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  for (const [rotulo, valor] of partes) {
    doc.setTextColor(...SUAVE);
    doc.text(rotulo, x + 3, cy);
    doc.setTextColor(...TEXTO);
    doc.text(valor, x + 3 + colRotulo, cy);
    cy += valor.length * 3.2 + 1.2;
  }
}

function cabecalhoInformacoes(doc, titulo, recorte, areaRecorte, continuacao) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...VERDE);
  doc.text(continuacao ? "Informações das camadas (continuação)" : "Informações das camadas", INFO.x, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SUAVE);
  const area = areaRecorte ? ` · área do recorte: ${numero(areaRecorte)} ha` : "";
  doc.text(`${titulo} · ${recorte}${area}`, INFO.x, 19.5);
  doc.setDrawColor(200, 194, 182);
  doc.setLineWidth(0.3);
  doc.line(INFO.x, 22.5, FOLHA.largura - INFO.x, 22.5);
}

function notaInformacoes(doc, base) {
  const nota = "Áreas e comprimentos somados feição a feição: sobreposição entre feições conta duas vezes. "
    + "Num núcleo ou nos seis, a medida é o campo ha_no_nucleo ou km_no_nucleo da base oficial "
    + `${base}. Num município ou num imóvel do CAR, e em bioma e estado, é medida geodésica da parte dentro do recorte, `
    + "na cópia do mapa, com diferença pequena na borda. Sem CPF, CNPJ ou nome de pessoa.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...SUAVE);
  doc.text(doc.splitTextToSize(nota, FOLHA.largura - 2 * INFO.x), INFO.x, 197);
}

function desenharInformacoes(doc, resumos, { titulo, recorte, base, imovel }) {
  if (!resumos?.length && !imovel) return;
  const areaRecorte = imovel?.area_ha ?? resumos.find((item) => item.resumo)?.resumo.area_recorte;
  let colunas = Array(INFO.colunas).fill(INFO.topo);
  const novaPagina = (continuacao) => {
    doc.addPage("a4", "landscape");
    cabecalhoInformacoes(doc, titulo, recorte, areaRecorte, continuacao);
    notaInformacoes(doc, base);
    colunas = Array(INFO.colunas).fill(INFO.topo);
  };
  novaPagina(false);
  if (imovel) {
    desenharCartaoImovel(doc, INFO.x, colunas[0], imovel);
    colunas[0] += alturaDoCartaoImovel(doc, imovel) + 5;
  }
  for (const item of resumos) {
    const altura = alturaDoCartao(item.resumo, item.modo);
    let coluna = colunas.indexOf(Math.min(...colunas));
    if (colunas[coluna] + altura > INFO.base) {
      novaPagina(true);
      coluna = 0;
    }
    const x = INFO.x + coluna * (INFO.largura + INFO.separacao);
    desenharCartao(doc, x, colunas[coluna], item);
    colunas[coluna] += altura + 5;
  }
}

// Folha ----------------------------------------------------------------------

export async function exportarPDF(map, {
  titulo, recorte, nucleoAtual, municipioAtual, contornos, contornosMunicipios, camadas, catalogo, fundo, base,
  resumos = [], fontesExtras = [], notaLegenda: nota = null, imovel = null, comInformacoes = false,
}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const hoje = new Date();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(NOTA.fonte);
  notaLegenda = nota ? { texto: nota, largura: doc.getTextWidth(nota) } : null;

  const { imagem, centro, zoom, presentes, colunas } = await fotografar(
    map, (m) => arrumarLegenda(doc, m, camadas), enquadramentoDoImovel(imovel),
  );

  doc.addImage(imagem, "JPEG", QUADRO.x, QUADRO.y, QUADRO.largura, QUADRO.altura);
  doc.setDrawColor(180, 174, 162);
  doc.setLineWidth(0.3);
  doc.rect(QUADRO.x, QUADRO.y, QUADRO.largura, QUADRO.altura);

  desenharMapinhas(doc, contornos, nucleoAtual);
  desenharMapinhaMunicipios(doc, contornosMunicipios, municipioAtual);
  desenharMapinhaImovel(doc, contornosMunicipios, municipioAtual, imovel);
  desenharTitulo(doc, titulo || "Projeto Vertentes", recorte, nucleoAtual);
  desenharNorte(doc);
  desenharEscala(doc, centro, zoom);
  desenharLegenda(doc, colunas);

  const fontes = [];
  for (const camada of presentes) {
    const ficha = catalogo.get(camada.id);
    const texto = ficha?.fonte || camada.fonte || camada.titulo;
    if (!fontes.includes(texto)) fontes.push(texto);
  }
  fontes.push(...fontesExtras);
  const atribuicao = fundo === "satelite"
    ? "Fundo: Esri World Imagery."
    : "Fundo: © OpenStreetMap, OpenMapTiles, OpenFreeMap.";
  const rodape = `Fonte: ${fontes.join("; ")}. Base ${base}. ${atribuicao} `
    + "Mapa de leitura em Web Mercator: áreas e números saem da base oficial, em SIRGAS 2000. "
    + `Projeto Vertentes, gerado em ${hoje.toLocaleDateString("pt-BR")}.`;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(...SUAVE);
  doc.text(doc.splitTextToSize(rodape, QUADRO.largura), QUADRO.x, RODAPE_Y);

  desenharInformacoes(doc, resumos, {
    titulo: titulo || "Projeto Vertentes", recorte, base, imovel: comInformacoes ? imovel : null,
  });

  const carimbo = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, "0")}${String(hoje.getDate()).padStart(2, "0")}`
    + `_${String(hoje.getHours()).padStart(2, "0")}${String(hoje.getMinutes()).padStart(2, "0")}`;
  doc.save(`Vertentes_mapa_${carimbo}.pdf`);
}
