# -*- coding: utf-8 -*-
"""Grupo "Selecao de municipios" no webmap (reuniao de 27/10/2026, pedido do Gustavo).

Um mapa por criterio da selecao, com o valor bruto do municipio em classes de cor. A
fonte e a tabela integrada da demanda 018. No banco fica uma tabela so,
vertentes.selecao_municipios, com a geometria dos municipios e todos os criterios com nome
legivel; cada criterio e uma view dela (sel_<criterio>), para o catalogo e a funcao tile
tratarem como camada. Clicar em qualquer criterio mostra todos os criterios do municipio.

Gera tambem web/js/selecao.js, com as classes e a legenda de cada criterio.

Uso:
    python _08_selecao_municipios.py
"""

import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2

PASTA = Path(__file__).resolve().parent
TABELA = PASTA.parent / "018_metodologia_indicadores" / "Tabela_integrada_municipios_v20261029.xlsx"
SAIDA_JS = PASTA / "web" / "js" / "selecao.js"
VERSAO = "v20261029"

PALETAS = {
    "Agropecuário": ["#fdd49e", "#fdbb84", "#fc8d59", "#e34a33", "#b30000"],
    "Governança": ["#dadaeb", "#bcbddc", "#9e9ac8", "#756bb1", "#54278f"],
    "Ambiental": ["#c7e9c0", "#a1d99b", "#74c476", "#31a354", "#006d2c"],
    "Biodiversidade": ["#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"],
}
COR_ZERO = "#efece6"
COR_SEM_DADO = "#bdbdbd"

# (id da view, eixo, titulo no painel, coluna da tabela integrada, nome do campo no mapa, casas)
CRITERIOS = [
    ("pastagem_degradada", "Agropecuário", "Pastagem degradada, vigor baixo + médio",
     "prod_pastagem_vigor_baixo_medio_ha", "Pastagem vigor baixo + médio (ha)", 0),
    ("empresas_ater", "Agropecuário", "Empresas de ATER", "prod_empresas_ater", "Empresas de ATER (nº)", 0),
    ("soja", "Agropecuário", "Soja", "prod_soja_ha", "Soja (ha)", 0),
    ("bovinos", "Agropecuário", "Bovinos", "prod_bovinos_cab", "Bovinos (cabeças)", 0),
    ("propriedades", "Agropecuário", "Propriedades", "prod_propriedades", "Propriedades (nº)", 0),
    ("governanca_gge", "Governança", "Governança GGE", "prod_gge_pontuacao", "Governança GGE (pontos)", 0),
    ("comites", "Governança", "Comitês de bacia", "amb_comites_nota_original", "Comitês de bacia (pontos)", 0),
    ("passivo_car", "Ambiental", "Passivo de APP, RL e uso restrito", "amb_passivo_total_ha", "Passivo no CAR (ha)", 0),
    ("area_protegida", "Ambiental", "Área protegida, UC e RPPN", "amb_area_protegida_ha", "Área protegida, UC e RPPN (ha)", 0),
    ("vegetacao_nativa", "Ambiental", "Vegetação nativa remanescente", "amb_veg_nativa_ha", "Vegetação nativa (ha)", 0),
    ("areas_prioritarias", "Biodiversidade", "Áreas prioritárias ponderadas pela classe", "bio_ap_ha_ponderada",
     "Áreas prioritárias, ha x classe", 0),
    ("pan_n", "Biodiversidade", "Espécies ameaçadas: número de PANs", "bio_pan_n", "PANs (nº)", 0),
    ("pan_area", "Biodiversidade", "Espécies ameaçadas: área com PAN", "bio_pan_pct_uniao", "Área com PAN (%)", 1),
    ("invasoras_riqueza", "Biodiversidade", "Plantas invasoras: riqueza", "bio_inv_plantas_riqueza",
     "Plantas invasoras (espécies)", 0),
    ("invasoras_densidade", "Biodiversidade", "Plantas invasoras: registros",
     "bio_inv_plantas_dens_100km2", "Registros de plantas invasoras (por 100 km²)", 2),
]
# Entram so no popup, como apoio de leitura.
EXTRAS = [
    ("amb_veg_nativa_pct", "Vegetação nativa (% do município)", 1),
    ("amb_area_protegida_pct", "Área protegida (% do município)", 1),
]


def ler_env() -> dict[str, str]:
    valores = {}
    with open(PASTA / ".env", encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                chave, valor = linha.split("=", 1)
                valores[chave.strip()] = valor.strip()
    return valores


def arredonda_quebra(v: float) -> float:
    """Duas casas significativas, para a legenda ficar legível."""
    if v <= 0:
        return v
    ordem = 10 ** (int(np.floor(np.log10(v))) - 1)
    return float(round(v / ordem) * ordem)


def numero(v: float) -> str:
    texto = f"{v:,.2f}".rstrip("0").rstrip(".") if v < 10 else f"{v:,.0f}"
    return texto.replace(",", "X").replace(".", ",").replace("X", ".")


def faixa(a: float, b: float, inteiro: bool) -> str:
    if inteiro:
        return numero(a) if a == b else f"{numero(a)} a {numero(b)}"
    return f"{numero(a)} a {numero(b)}"


def classes(valores: pd.Series, paleta: list[str], campo: str) -> tuple[list, list]:
    """Quintis; com muito zero, o zero vira classe propria e os positivos vao em quartis.

    Contagem (so inteiros) fica em faixas inteiras: 1 a 2, 3 a 4... A ultima classe fecha
    no maior valor encontrado.
    """
    v = valores.dropna()
    maximo = float(v.max())
    inteiro = bool((v == v.round()).all()) and maximo <= 200
    expr = ["step", ["to-number", ["get", campo], -1], COR_SEM_DADO]
    legenda = []
    com_zero = (v == 0).mean() >= 0.2
    base = v[v > 0] if com_zero else v
    qs = base.quantile([0.25, 0.5, 0.75] if com_zero else [0.2, 0.4, 0.6, 0.8])
    if inteiro:
        quebras = sorted({float(round(q)) for q in qs})
        inicio = 1.0 if com_zero else float(base.min())
    else:
        quebras = sorted({arredonda_quebra(q) for q in qs})
        inicio = 0.0
    quebras = [q for q in quebras if inicio <= q < maximo]
    cores = (paleta[1:] if com_zero else paleta)[: len(quebras) + 1]
    if com_zero:
        expr += [0, COR_ZERO, 1e-9, cores[0]]
        legenda.append(["Zero", COR_ZERO])
    else:
        expr += [0, cores[0]]
    # Em inteiro, a classe vai ate a quebra inclusive; em continuo, o degrau e a propria quebra.
    de = inicio
    for i, q in enumerate(quebras):
        expr += [q + 0.5 if inteiro else q, cores[i + 1]]
        if inteiro:
            legenda.append([faixa(de, q, True), cores[i]])
            de = q + 1
        else:
            rotulo = (f"Acima de 0 a {numero(q)}" if com_zero else f"Até {numero(q)}") if i == 0 \
                else f"{numero(de)} a {numero(q)}"
            legenda.append([rotulo, cores[i]])
            de = q
    legenda.append([faixa(de, maximo, inteiro), cores[len(quebras)]])
    if valores.isna().any():
        legenda.append(["Sem dado", COR_SEM_DADO])
    return expr, legenda


def unidade(nome: str) -> str:
    """'Soja (ha)' -> 'ha'; 'Áreas prioritárias, ha x classe' -> 'ha x classe'."""
    if nome.endswith(")"):
        return nome[nome.rindex("(") + 1:-1]
    return nome.split(", ")[-1]


def main() -> None:
    t = pd.read_excel(TABELA, sheet_name="municipios", dtype={"cd_mun": str})
    campos = [(c[3], c[4], c[5]) for c in CRITERIOS] + EXTRAS
    dados = t[["nucleo", "cd_mun"]].copy()
    for coluna, nome, casas in campos:
        dados[nome] = t[coluna].round(casas)

    conn = psycopg2.connect(ler_env()["DATABASE_URL"])
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("drop table if exists vertentes.selecao_municipios cascade")
    cur.execute("drop table if exists pg_temp.selecao_dados")
    defs = ", ".join(f'"{nome}" double precision' for _, nome, _ in campos)
    cur.execute(f"create temp table selecao_dados (nucleo integer, cd_mun text, {defs})")
    marcadores = ", ".join(["%s"] * (2 + len(campos)))
    linhas = [[int(r[0]), r[1], *[None if pd.isna(x) else float(x) for x in r[2:]]]
              for r in dados.itertuples(index=False)]
    cur.executemany(f"insert into selecao_dados values ({marcadores})", linhas)
    lista = ", ".join(f'd."{nome}"' for _, nome, _ in campos)
    cur.execute(f"""
        create table vertentes.selecao_municipios as
        select m.fid, m.geom, m.nucleo, m.nome_nucleo, m.selecionado, m.cd_mun, m.nm_mun, m.sigla_uf, {lista}
          from vertentes.municipios_malha_2025 m
          join selecao_dados d on d.nucleo = m.nucleo and d.cd_mun = m.cd_mun
         where m.selecionado = 'Sim'
    """)
    cur.execute("alter table vertentes.selecao_municipios add primary key (fid)")
    cur.execute("create index on vertentes.selecao_municipios using gist (geom)")
    cur.execute("alter table vertentes.selecao_municipios enable row level security")
    cur.execute("select count(*) from vertentes.selecao_municipios")
    n = cur.fetchone()[0]
    if n != len(dados):
        raise SystemExit(f"{len(dados)} municipios na tabela e {n} com geometria")

    cur.execute("delete from vertentes.camadas where camada like 'sel\\_%%'")
    cur.execute("delete from vertentes.presenca where camada like 'sel\\_%%'")
    entradas = []
    for ident, eixo, titulo, coluna, nome, _ in CRITERIOS:
        camada = f"sel_{ident}"
        cur.execute(f"create view vertentes.{camada} as select * from vertentes.selecao_municipios")
        cur.execute("""
            insert into vertentes.camadas
                (camada, titulo, tema, geometria, registros, versao, fonte, descricao,
                 zoom_minimo, tolerancia_m, base, vira_ponto, recorta_municipio)
            values (%s, %s, 'selecao', 'MULTIPOLYGON', %s, %s, %s, %s, 0, 5, %s, false, true)
        """, (camada, f"{eixo} · {titulo}", n, VERSAO,
              "Tabela integrada de municípios, demanda 018 (Ernani, MapBiomas, CNUC, MMA, ICMBio, Sühs et al. 2025)",
              f"Valor bruto do critério: {nome}.", TABELA.name))
        cur.execute("""
            insert into vertentes.presenca (camada, nucleo, cd_mun)
            select %s, nucleo, null from vertentes.selecao_municipios group by nucleo
            union all
            select %s, nucleo, cd_mun from vertentes.selecao_municipios
        """, (camada, camada))
        expr, legenda = classes(dados[nome], PALETAS[eixo], nome)
        entradas.append({
            "id": camada, "titulo": f"{eixo} · {titulo} ({unidade(nome)})", "tema": "selecao", "tipo": "fill",
            "pintura": {"fill-color": expr, "fill-opacity": 0.8},
            "contorno": {"line-color": "#ffffff", "line-width": 0.6},
            "legenda": legenda, "titulo_popup": "nm_mun", "rotulo": "nm_mun",
            "nota": f"{nome}. Classes pelos quantis dos 158 municípios dos seis núcleos.",
        })
    conn.commit()
    conn.close()

    # O painel lista do fim para o comeco (a ultima desenhada fica no topo da lista).
    entradas.reverse()
    texto = ("// Gerado por _08_selecao_municipios.py: nao editar a mao.\n"
             "// Um mapa por criterio da selecao de municipios (reuniao de 27/10/2026).\n"
             f"export const CAMADAS_SELECAO = {json.dumps(entradas, ensure_ascii=False, indent=2)};\n")
    SAIDA_JS.write_text(texto, encoding="utf-8")
    print(f"selecao_municipios: {n} municipios, {len(entradas)} criterios; {SAIDA_JS.name} gravado")
    for e in entradas:
        print(f"  {e['id']:26s} " + " | ".join(r for r, _ in e["legenda"]))


if __name__ == "__main__":
    main()
