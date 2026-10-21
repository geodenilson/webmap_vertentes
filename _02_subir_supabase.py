# -*- coding: utf-8 -*-
"""Sobe a copia web para o esquema vertentes do Supabase.

Le _cache/vertentes_web_<versao>.gpkg, gerado por _01_copia_web.py, e grava cada camada como
tabela em vertentes, com indice espacial e RLS ligado. O catalogo vertentes.camadas recebe a
fonte e a versao do dicionario da base oficial, para o mapa poder citar a fonte na legenda e no
PDF.

A ordem e da menor camada para a maior: o mapa pode ser testado antes do CAR terminar de subir.

Uso:
    python _02_subir_supabase.py                     sobe todas
    python _02_subir_supabase.py camada [camada...]  sobe so essas, substituindo
"""

import csv
import os
import sqlite3
import sys
import time

os.environ["PROJ_DATA"] = r"C:\OSGeo4W\share\proj"
os.environ["PROJ_LIB"] = r"C:\OSGeo4W\share\proj"

import psycopg2  # noqa: E402
from osgeo import gdal  # noqa: E402

gdal.UseExceptions()
gdal.SetConfigOption("PG_USE_COPY", "YES")

PASTA = os.path.dirname(os.path.abspath(__file__))
VERSAO = "v20261004b"
WEB = os.path.join(PASTA, "_cache", f"vertentes_web_{VERSAO}.gpkg")
DICIONARIO = r"F:\Vertentes\Demandas\013_Base_Nucleos_gpkg\dicionario_v20261004b.csv"
BASE = f"Vertentes_nucleos_{VERSAO}.gpkg"
ESQUEMA = "vertentes"

# Ficam na base oficial e fora do mapa. Os cursos d'agua da ANA repetem a drenagem da BC250;
# do PAN fica so a camada de areas estrategicas.
FORA_DO_MAPA = {"curso_dagua_ana_bho6", "pan_abrangencia_icmbio_2024_05"}

# Abaixo deste zoom a camada nao e pedida ao banco. Sao as de centenas de milhares de
# poligonos, que so se leem no recorte de um municipio.
ZOOM_MINIMO = {
    "car_imovel_2026_06": 11,
    "car_passivo_2026_06": 11,
    "sigef_privado": 11,
    "sigef_publico": 10,
    "snci_privado": 10,
    "snci_publico": 10,
    "prodes_cerrado_anual_v20260717": 9,
    "prodes_caatinga_anual_v20260805": 9,
    "prodes_pantanal_anual_v20260717": 9,
    "curso_dagua_ana_bho6": 9,
    "drenagem_bc250_2025": 7,
    "asv_sinaflor": 8,
}
TOLERANCIA_M = {
    "car_imovel_2026_06": 2, "car_passivo_2026_06": 2,
    "sigef_privado": 2, "sigef_publico": 2, "snci_privado": 2, "snci_publico": 2,
    "geologia_ibge_2021": 15, "geomorfologia_ibge_2021": 15, "pedologia_ibge_2021": 15,
    "vegetacao_ibge_2026": 15, "biomas_ibge_2025": 15, "limite_estadual_malha_2025": 15,
    "regioes_hidrograficas": 15, "unidades_gestao_hidrica_ana_2014": 15,
    "ottobacia_n04_ana_bho6": 15,
}


def ler_env() -> dict[str, str]:
    valores = {}
    with open(os.path.join(PASTA, ".env"), encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                chave, valor = linha.split("=", 1)
                valores[chave.strip()] = valor.strip()
    return valores


def camadas_por_tamanho() -> list[tuple[str, str, int]]:
    con = sqlite3.connect(f"file:{WEB}?mode=ro", uri=True)
    cur = con.cursor()
    lista = []
    for (tab,) in cur.execute("SELECT table_name FROM gpkg_contents WHERE data_type='features'").fetchall():
        col = cur.execute(
            "SELECT column_name FROM gpkg_geometry_columns WHERE table_name=?", (tab,)
        ).fetchone()[0]
        tipo = cur.execute(
            "SELECT geometry_type_name FROM gpkg_geometry_columns WHERE table_name=?", (tab,)
        ).fetchone()[0]
        (b,) = cur.execute(f'SELECT COALESCE(SUM(LENGTH("{col}")),0) FROM "{tab}"').fetchone()
        lista.append((tab, tipo, b))
    con.close()
    return sorted(lista, key=lambda x: x[2])


def dicionario() -> dict[str, dict[str, str]]:
    with open(DICIONARIO, encoding="utf-8-sig") as f:
        return {linha["camada"]: linha for linha in csv.DictReader(f, delimiter=";")}


def subir(url: str, camada: str) -> None:
    gdal.VectorTranslate(
        "PG:" + url,
        WEB,
        options=[
            "-f", "PostgreSQL",
            "-nln", f"{ESQUEMA}.{camada}",
            "-lco", "GEOMETRY_NAME=geom",
            "-lco", "FID=fid",
            "-lco", "SPATIAL_INDEX=GIST",
            "-lco", "OVERWRITE=YES",
            "-lco", "LAUNDER=YES",
            "-nlt", "PROMOTE_TO_MULTI",
            "-gt", "20000",
            camada,
        ],
    )


def registrar(cur, camada: str, tipo: str, ficha: dict[str, str]) -> None:
    cur.execute(f'alter table {ESQUEMA}."{camada}" enable row level security')
    cur.execute(f'analyze {ESQUEMA}."{camada}"')
    cur.execute(f'select count(*) from {ESQUEMA}."{camada}"')
    (n,) = cur.fetchone()
    cur.execute(
        f"""
        insert into {ESQUEMA}.camadas
            (camada, titulo, tema, geometria, registros, versao, fonte, descricao,
             zoom_minimo, tolerancia_m, base, carregada_em)
        values (%s, %s, null, %s, %s, %s, %s, %s, %s, %s, %s, now())
        on conflict (camada) do update set
            geometria = excluded.geometria, registros = excluded.registros,
            versao = excluded.versao, fonte = excluded.fonte, descricao = excluded.descricao,
            zoom_minimo = excluded.zoom_minimo, tolerancia_m = excluded.tolerancia_m,
            base = excluded.base, carregada_em = now()
        """,
        (
            camada, camada, tipo, n,
            ficha.get("versao"), ficha.get("fonte"), ficha.get("descricao"),
            ZOOM_MINIMO.get(camada, 0),
            None if "POINT" in tipo.upper() else TOLERANCIA_M.get(camada, 5),
            BASE,
        ),
    )


def main() -> None:
    url = ler_env()["DATABASE_URL"]
    fichas = dicionario()
    pedidas = set(sys.argv[1:])
    lista = [
        c for c in camadas_por_tamanho()
        if c[0] not in FORA_DO_MAPA and (not pedidas or c[0] in pedidas)
    ]
    if pedidas - {c[0] for c in lista}:
        raise SystemExit(f"camada ausente na copia web: {', '.join(sorted(pedidas - {c[0] for c in lista}))}")

    con = psycopg2.connect(url)
    con.autocommit = True
    inicio = time.time()
    for i, (camada, tipo, b) in enumerate(lista, start=1):
        t0 = time.time()
        subir(url, camada)
        with con.cursor() as cur:
            registrar(cur, camada, tipo, fichas.get(camada, {}))
        print(f"[{i:2}/{len(lista)}] {camada:45} {b / 1e6:7.1f} MB  {time.time() - t0:7.1f} s", flush=True)

    with con.cursor() as cur:
        cur.execute("select pg_size_pretty(pg_database_size(current_database()))")
        (tamanho,) = cur.fetchone()
    con.close()
    print(f"\nfim em {(time.time() - inicio) / 60:.1f} min. Banco agora: {tamanho}", flush=True)


if __name__ == "__main__":
    main()
