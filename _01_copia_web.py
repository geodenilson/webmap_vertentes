# -*- coding: utf-8 -*-
"""Copia da base oficial para o webmap.

Le Vertentes_nucleos_v20261004b.gpkg e grava _cache/vertentes_web_v20261004b.gpkg, que e o
arquivo enviado ao Supabase. A base oficial continua sendo a fonte de todo numero; esta copia
so serve para desenhar.

Tres mudancas em relacao a base:
1. Projecao Web Mercator (EPSG:3857), a do tile, para o banco nao reprojetar a cada pedido.
2. Simplificacao pela escala de leitura. Imovel, passivo e SIGEF ficam em 2 m, abaixo de um
   pixel no zoom 16. Mapeamento regional do IBGE e da ANA fica em 15 m.
3. Dado pessoal e identificador de imovel nao saem da maquina: CPF, CNPJ, nome de autuado,
   de detentor e de imovel, processo, codigo do CAR, matricula e responsavel tecnico.

Uso:
    python _01_copia_web.py                     refaz a copia inteira
    python _01_copia_web.py camada [camada...]  refaz so essas camadas
"""

import os
import re
import sqlite3
import sys
import time

os.environ["PROJ_DATA"] = r"C:\OSGeo4W\share\proj"
os.environ["PROJ_LIB"] = r"C:\OSGeo4W\share\proj"

from osgeo import gdal, ogr  # noqa: E402

gdal.UseExceptions()

BASE = r"F:\Vertentes\Demandas\013_Base_Nucleos_gpkg\Vertentes_nucleos_v20261004b.gpkg"
VERSAO = "v20261004b"
PASTA = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(PASTA, "_cache", f"vertentes_web_{VERSAO}.gpkg")

METRO_EM_GRAU = 1 / 111_320

# Ficam na base oficial e fora do mapa. Os cursos d'agua da ANA repetem a drenagem da BC250;
# do PAN fica so a camada de areas estrategicas.
FORA_DO_MAPA = {"curso_dagua_ana_bho6", "pan_abrangencia_icmbio_2024_05"}

# Tolerancia em metros. O que nao esta aqui fica com a padrao.
TOLERANCIA_PADRAO = 5
TOLERANCIA = {
    "car_imovel_2026_06": 2,
    "car_passivo_2026_06": 2,
    "sigef_privado": 2,
    "sigef_publico": 2,
    "snci_privado": 2,
    "snci_publico": 2,
    "geologia_ibge_2021": 15,
    "geomorfologia_ibge_2021": 15,
    "pedologia_ibge_2021": 15,
    "vegetacao_ibge_2026": 15,
    "biomas_ibge_2025": 15,
    "limite_estadual_malha_2025": 15,
    "regioes_hidrograficas": 15,
    "unidades_gestao_hidrica_ana_2014": 15,
    "ottobacia_n04_ana_bho6": 15,
}

# Campos que nunca sobem: dado pessoal, identificador de imovel e lixo de geoprocessamento.
NUNCA = {
    "cod_imovel", "cod_tema", "nom_tema",
    "nome_imove", "nome_embar", "cpf_cnpj_e", "num_proces",
    "num_pessoa_infrator", "nome_infrator", "cpf_cnpj_infrator", "num_processo",
    "des_local_infracao",
    "nm_empreen", "nu_art", "nm_detento", "nu_cpf_cnp", "nu_car_imo", "nu_recibo", "nu_autoriz",
    "parcela_co", "rt", "art", "codigo_imo", "registro_m", "registro_d",
    "cod_profis", "num_certif",
    "cpf_cnpj", "autuado", "processo",
}
# No SIGEF e no SNCI, nome_area e o nome do imovel. Nas areas prioritarias e o nome da area.
NUNCA_NA_CAMADA = {
    "sigef_privado": {"nome_area"},
    "sigef_publico": {"nome_area"},
}
PADRAO_PESSOAL = re.compile(r"cpf|cnpj|infrator|autuad|detent|empreen|proces", re.I)
PADRAO_LIXO = re.compile(r"^(fid_|shape_|st_area|st_perimet|objectid)", re.I)

# No passivo a base herdou dezenas de campos do intersect. Ficam so estes.
SO_ESTES = {
    "car_passivo_2026_06": [
        "classe", "geocodigo", "nom_munic", "sigla_uf", "Bioma",
        "nucleo", "nome_nucleo", "selecionado", "ha_no_nucleo",
    ],
}


def campos(camada: ogr.Layer, nome: str) -> list[str]:
    defn = camada.GetLayerDefn()
    todos = [defn.GetFieldDefn(i).GetName() for i in range(defn.GetFieldCount())]
    if nome in SO_ESTES:
        return [c for c in SO_ESTES[nome] if c in todos]
    so_aqui = NUNCA_NA_CAMADA.get(nome, set())
    return [
        c for c in todos
        if c.lower() not in NUNCA
        and c.lower() not in so_aqui
        and not PADRAO_PESSOAL.search(c)
        and not PADRAO_LIXO.search(c)
    ]


def bytes_por_camada(caminho: str) -> dict[str, tuple[int, int]]:
    con = sqlite3.connect(f"file:{caminho}?mode=ro", uri=True)
    cur = con.cursor()
    medida = {}
    for (tab,) in cur.execute("SELECT table_name FROM gpkg_contents WHERE data_type='features'").fetchall():
        col = cur.execute(
            "SELECT column_name FROM gpkg_geometry_columns WHERE table_name=?", (tab,)
        ).fetchone()[0]
        n, b = cur.execute(f'SELECT COUNT(*), COALESCE(SUM(LENGTH("{col}")),0) FROM "{tab}"').fetchone()
        medida[tab] = (n, b)
    con.close()
    return medida


def main() -> None:
    pedidas = sys.argv[1:]
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    if not pedidas and os.path.exists(SAIDA):
        os.remove(SAIDA)

    origem = ogr.Open(BASE)
    nomes = [
        origem.GetLayerByIndex(i).GetName() for i in range(origem.GetLayerCount())
        if origem.GetLayerByIndex(i).GetName() not in FORA_DO_MAPA
    ]
    if pedidas:
        desconhecidas = set(pedidas) - set(nomes)
        if desconhecidas:
            raise SystemExit(f"camada inexistente na base: {', '.join(sorted(desconhecidas))}")
        nomes = pedidas
    retirados = {}
    for nome in nomes:
        camada = origem.GetLayerByName(nome)
        if camada.GetGeomType() == ogr.wkbNone:
            continue
        escolhidos = campos(camada, nome)
        defn = camada.GetLayerDefn()
        retirados[nome] = [
            defn.GetFieldDefn(i).GetName() for i in range(defn.GetFieldCount())
            if defn.GetFieldDefn(i).GetName() not in escolhidos
        ]
        tol_m = TOLERANCIA.get(nome, TOLERANCIA_PADRAO)
        pontos = ogr.GT_Flatten(camada.GetGeomType()) in (ogr.wkbPoint, ogr.wkbMultiPoint)

        opcoes = [
            "-f", "GPKG", "-nln", nome, "-t_srs", "EPSG:3857", "-dim", "XY",
            "-nlt", "PROMOTE_TO_MULTI", "-makevalid", "-xyRes", "0.1 m",
            "-select", ",".join(escolhidos),
        ]
        if not pontos:
            opcoes += ["-simplify", f"{tol_m * METRO_EM_GRAU:.10f}"]
        if os.path.exists(SAIDA):
            opcoes = ["-update", "-overwrite"] + opcoes

        t0 = time.time()
        gdal.VectorTranslate(SAIDA, BASE, options=opcoes + [nome])
        print(f"{nome:45} tol {0 if pontos else tol_m:>2} m  {time.time() - t0:6.1f} s", flush=True)

    antes = bytes_por_camada(BASE)
    depois = bytes_por_camada(SAIDA)
    print("\ncamada                                        registros   base MB   web MB")
    for nome in sorted(depois, key=lambda k: -depois[k][1]):
        n0, b0 = antes.get(nome, (0, 0))
        n1, b1 = depois[nome]
        aviso = "" if n0 == n1 else f"  registros mudaram: {n0} -> {n1}"
        print(f"{nome:45} {n1:9,d} {b0 / 1e6:9.1f} {b1 / 1e6:8.1f}{aviso}")
    t0 = sum(b for _, b in antes.values())
    t1 = sum(b for _, b in depois.values())
    print(f"\nTOTAL geometria: base {t0 / 1e6:,.0f} MB, web {t1 / 1e6:,.0f} MB")
    print(f"arquivo web: {os.path.getsize(SAIDA) / 1e6:,.0f} MB")

    print("\ncampos retirados por camada:")
    for nome, lista in retirados.items():
        if lista:
            print(f"  {nome}: {', '.join(lista)}")


if __name__ == "__main__":
    sys.exit(main())
