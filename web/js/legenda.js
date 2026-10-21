// Itens de legenda de uma camada, iguais na tela e no PDF.
// Camada sem classe: uma linha so, com o nome da camada.
// Camada com classes: o nome da camada como titulo e uma linha recuada por classe, para
// a camada seguinte nao parecer mais uma classe.
// O simbolo segue a geometria de origem, e nao o jeito de desenhar: poligono e sempre
// retangulo, vazado quando a camada so tem contorno; linha e traco; ponto e ponto.

function literal(valor) {
  return typeof valor === "string" ? valor : null;
}

function simboloDe(camada) {
  const g = (camada.geometria || "").toUpperCase();
  if (g.includes("POLYGON")) return "poligono";
  if (g.includes("LINE")) return "linha";
  if (g.includes("POINT")) return "ponto";
  return { fill: "poligono", line: "linha", circle: "ponto" }[camada.tipo] ?? "poligono";
}

export function amostraDe(camada, cor) {
  const simbolo = simboloDe(camada);
  if (simbolo !== "poligono") return { simbolo, cor };
  // Poligono desenhado so como linha (limite estadual, bioma, comite): retangulo vazado.
  if (camada.tipo === "line") return { simbolo, preenchimento: null, borda: cor };

  const contorno = literal(camada.contorno?.["line-color"]);
  const fundo = literal(camada.pintura["fill-color"]);
  const opacidade = typeof camada.pintura["fill-opacity"] === "number" ? camada.pintura["fill-opacity"] : 1;
  // A cor da legenda e a do contorno (nucleo, municipio): retangulo com essa borda e o
  // fundo da camada, ou vazado quando o fundo e transparente. So vale quando o fundo e
  // uma cor unica; em camada com classes a cor da legenda e sempre a da classe.
  if (contorno && fundo && contorno.toLowerCase() === cor.toLowerCase()) {
    return { simbolo, preenchimento: fundo && opacidade > 0.05 ? fundo : null, opacidade, borda: cor };
  }
  return { simbolo, preenchimento: cor, opacidade: Math.max(opacidade, 0.6), borda: contorno || cor };
}

// Classes presentes ----------------------------------------------------------
// A legenda mostra so as classes que aparecem no desenho. Para saber a classe de cada
// feicao, avalia a mesma expressao de cor que o mapa usa para pintar. Cobre as expressoes
// usadas em camadas.js; outra qualquer (interpolate do PRODES) mantem todas as classes.

class ExpressaoDesconhecida extends Error {}

// Categorias do SNUC no grupo de protecao integral (Lei 9.985/2000, art. 8).
const PROTECAO_INTEGRAL = new Set([
  "Estação Ecológica", "Reserva Biológica", "Parque", "Monumento Natural", "Refúgio de Vida Silvestre",
]);

function avaliar(expr, props) {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr;
  switch (op) {
    case "get": return props[args[0]] ?? null;
    case "has": return props[args[0]] !== undefined && props[args[0]] !== null;
    case "to-string": {
      const v = avaliar(args[0], props);
      return v === null || v === undefined ? "" : String(v);
    }
    case "to-number": {
      const n = Number(avaliar(args[0], props));
      return Number.isFinite(n) ? n : avaliar(args[1] ?? 0, props);
    }
    case "==": return String(avaliar(args[0], props)) === String(avaliar(args[1], props));
    case "!=": return String(avaliar(args[0], props)) !== String(avaliar(args[1], props));
    case "all": return args.every((a) => avaliar(a, props));
    case "match": {
      const valor = String(avaliar(args[0], props));
      for (let i = 1; i + 1 < args.length; i += 2) {
        const rotulos = Array.isArray(args[i]) ? args[i] : [args[i]];
        if (rotulos.map(String).includes(valor)) return avaliar(args[i + 1], props);
      }
      return avaliar(args[args.length - 1], props);
    }
    case "case": {
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (avaliar(args[i], props)) return avaliar(args[i + 1], props);
      }
      return avaliar(args[args.length - 1], props);
    }
    case "step": {
      const n = avaliar(args[0], props);
      let saida = avaliar(args[1], props);
      for (let i = 2; i + 1 < args.length; i += 2) {
        if (n >= args[i]) saida = avaliar(args[i + 1], props); else break;
      }
      return saida;
    }
    default:
      throw new ExpressaoDesconhecida(op);
  }
}

// Cor de uma classe do resumo, a mesma do mapa. Para a faixa de modulo fiscal, que chega
// do banco ja como rotulo, a cor sai da legenda pelo rotulo. Sem cor conhecida, devolve null.
export function corDaClasse(camada, campo, valor) {
  const pelaLegenda = camada.legenda.find(([rotulo]) => rotulo === valor);
  if (pelaLegenda) return pelaLegenda[1];
  const expr = expressaoDeCor(camada);
  if (!Array.isArray(expr)) return typeof expr === "string" ? expr : null;
  if (expr[0] === "interpolate") {
    // Rampa do PRODES por ano: interpola entre as paradas da propria expressao.
    const n = Number(valor);
    const paradas = expr.slice(3);
    for (let i = 0; i + 3 < paradas.length; i += 2) {
      const [a, ca, b, cb] = [paradas[i], paradas[i + 1], paradas[i + 2], paradas[i + 3]];
      if (n <= b || i + 4 >= paradas.length) {
        const t = Math.max(0, Math.min(1, (n - a) / (b - a)));
        const [ra, rb] = [ca, cb].map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
        return `#${ra.map((v, k) => Math.round(v + (rb[k] - v) * t).toString(16).padStart(2, "0")).join("")}`;
      }
    }
    return null;
  }
  // Na UC a cor depende do grupo, e o resumo separa por categoria: o grupo sai da categoria.
  const props = { [campo]: valor };
  if (campo === "categoria") {
    props.grupo = PROTECAO_INTEGRAL.has(valor) ? "Proteção Integral" : "Uso Sustentável";
  }
  try {
    const cor = avaliar(expr, props);
    return typeof cor === "string" ? cor : null;
  } catch {
    return null;
  }
}

function expressaoDeCor(camada) {
  if (camada.tipo === "fill") {
    // Na camada com classes so de contorno (nucleo, municipio), a cor da legenda e a da linha.
    const fundo = camada.pintura["fill-color"];
    return Array.isArray(fundo) ? fundo : camada.contorno?.["line-color"] ?? fundo;
  }
  return camada.pintura[camada.tipo === "line" ? "line-color" : "circle-color"];
}

// Devolve a camada com a legenda reduzida as classes que aparecem nas feicoes desenhadas.
// Sem feicoes, com uma classe so ou com expressao que nao sei avaliar, devolve como esta.
export function comClassesPresentes(camada, feicoes) {
  if (camada.legenda.length <= 1 || !feicoes?.length) return camada;
  const expr = expressaoDeCor(camada);
  if (!Array.isArray(expr)) return camada;
  const cores = new Set();
  try {
    for (const f of feicoes) {
      const cor = avaliar(expr, f.properties ?? {});
      if (typeof cor === "string") cores.add(cor.toLowerCase());
    }
  } catch (erro) {
    if (erro instanceof ExpressaoDesconhecida) return camada;
    throw erro;
  }
  const legenda = camada.legenda.filter(([, cor]) => cores.has(cor.toLowerCase()));
  if (!legenda.length) return camada;
  return { ...camada, legenda, comClasses: true };
}

export function itensLegenda(camada) {
  // Camada de classes que ficou com uma so no recorte continua com titulo e classe, para
  // nao perder o nome da classe.
  if (camada.legenda.length === 1 && !camada.comClasses) {
    const [, cor] = camada.legenda[0];
    return [{ tipo: "item", nivel: 0, texto: camada.titulo, camada: camada.id, ...amostraDe(camada, cor) }];
  }
  return [
    { tipo: "titulo", nivel: 0, texto: camada.titulo, camada: camada.id },
    ...camada.legenda.map(([texto, cor]) => ({
      tipo: "item", nivel: 1, texto, camada: camada.id, ...amostraDe(camada, cor),
    })),
  ];
}

// Cor do preenchimento ja misturada com o branco, para o retangulo da legenda mostrar o tom
// que se ve no mapa.
export function misturarComBranco(hex, opacidade = 1) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * opacidade + 255 * (1 - opacidade)));
}
