"""Vegetacao mapeada para o nivel do imovel: COG para o desenho e hectares por imovel.

Os 13 milhoes de poligonos (Vegetacao_Vertentes.gpkg) nao vao para o banco: a subida
levaria mais de 15 horas. Em vez disso, para cada cena (G1 a G194):
  1. o poligono da cena (Classificacao_Vegetacao/G<n>_vegetacao.gpkg) vira raster de 1 e 0
     na mesma grade de 5 m da imagem Planet;
  2. soma a vegetacao dentro de cada imovel do CAR dos seis nucleos, um imovel por vez, para
     que imovel sobreposto a outro nao perca area; a area do pixel vem da latitude da linha;
  3. grava o COG da vegetacao (EPSG:3857, GoogleMapsCompatible, DEFLATE, nodata 0).
No fim, _cache/vegetacao_cog/imovel_vegetacao.csv tem fid e hectares de vegetacao.

    python _07_vegetacao.py
"""

import csv
import math
import subprocess
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds

PASTA = Path(__file__).resolve().parent
PLANET = Path(r"F:\Vertentes\Planet_Vertentes")
VEGETACAO = Path(r"F:\Vertentes\Classificacao_Vegetacao")
SAIDA = PASTA / "_cache" / "vegetacao_cog"
IMOVEIS = PASTA / "_cache" / "car_imovel_seis_nucleos.gpkg"
PARALELO = 4

# Elipsoide GRS80 (SIRGAS 2000): metros por grau na latitude dada.
A, E2 = 6378137.0, 0.00669438002290


def metros_por_grau(lat):
    s = math.sin(math.radians(lat))
    n = A / math.sqrt(1 - E2 * s * s)
    m = A * (1 - E2) / (1 - E2 * s * s) ** 1.5
    return math.radians(1) * n * math.cos(math.radians(lat)), math.radians(1) * m


def baixar_imoveis():
    if IMOVEIS.exists():
        return
    url = next(l.split("=", 1)[1].strip() for l in (PASTA / ".env").read_text(encoding="utf-8").splitlines()
               if l.startswith("DATABASE_URL="))
    subprocess.run(["ogr2ogr", "-f", "GPKG", str(IMOVEIS), f"PG:{url}", "-nln", "imoveis",
                    "-sql", "select fid as id, st_transform(geom, 4674) as geom "
                            "from vertentes.car_imovel_2026_06 where selecionado = 'Sim'"], check=True)


def processar(cena: str):
    numero = cena[1:]
    destino = SAIDA / f"{cena}.tif"
    temporario = SAIDA / f"{cena}_mascara.tif"
    with rasterio.open(PLANET / f"{cena}.tif") as r:
        oeste, sul, leste, norte = r.bounds
        largura, altura = r.width, r.height
    subprocess.run(["gdal_rasterize", "-q", "-burn", "1", "-ot", "Byte", "-init", "0", "-a_nodata", "0",
                    "-te", str(oeste), str(sul), str(leste), str(norte), "-ts", str(largura), str(altura),
                    "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES",
                    str(VEGETACAO / f"G{numero}_vegetacao.gpkg"), str(temporario)], check=True)

    with rasterio.open(temporario) as r:
        veg = r.read(1)
        transf = r.transform
    dx, dy = transf.a, -transf.e
    lat_linhas = norte - (np.arange(altura) + 0.5) * dy
    ha_linha = np.array([metros_por_grau(lat)[0] * dx * metros_por_grau(lat)[1] * dy / 1e4 for lat in lat_linhas])

    imoveis = gpd.read_file(IMOVEIS, bbox=(oeste, sul, leste, norte))
    somas = {}
    for fid, geom in zip(imoveis["id"], imoveis.geometry):
        x0, y0, x1, y1 = geom.bounds
        x0, y0, x1, y1 = max(x0, oeste), max(y0, sul), min(x1, leste), min(y1, norte)
        if x0 >= x1 or y0 >= y1:
            continue
        janela = from_bounds(x0, y0, x1, y1, transf).round_offsets().round_lengths()
        lin0, col0 = max(janela.row_off, 0), max(janela.col_off, 0)
        lin1 = min(janela.row_off + max(janela.height, 1), altura)
        col1 = min(janela.col_off + max(janela.width, 1), largura)
        if lin1 <= lin0 or col1 <= col0:
            continue
        sub_transf = rasterio.windows.transform(rasterio.windows.Window(col0, lin0, col1 - col0, lin1 - lin0), transf)
        dentro = geometry_mask([geom], out_shape=(lin1 - lin0, col1 - col0), transform=sub_transf, invert=True)
        pixels = (veg[lin0:lin1, col0:col1] == 1) & dentro
        if pixels.any():
            somas[int(fid)] = float((pixels.sum(axis=1) * ha_linha[lin0:lin1]).sum())

    subprocess.run(["gdalwarp", "-q", "-overwrite", "-r", "near", "-of", "COG",
                    "-co", "TILING_SCHEME=GoogleMapsCompatible", "-co", "BLOCKSIZE=256",
                    "-co", "COMPRESS=DEFLATE", "-co", "PREDICTOR=2", "-co", "ADD_ALPHA=NO",
                    "-co", "OVERVIEW_RESAMPLING=MODE", "-co", "OVERVIEW_COUNT=4",
                    "-co", "OVERVIEWS=IGNORE_EXISTING", str(temporario), str(destino)], check=True)
    temporario.unlink(missing_ok=True)
    return cena, somas, round(destino.stat().st_size / 1e6, 1), int((veg == 1).sum())


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    baixar_imoveis()
    cenas = sorted((p.stem for p in PLANET.glob("G*.tif")), key=lambda s: int(s[1:]))
    total = defaultdict(float)
    mb = 0.0
    with ProcessPoolExecutor(PARALELO) as fila:
        for i, (cena, somas, tamanho, pixels) in enumerate(fila.map(processar, cenas), start=1):
            for fid, ha in somas.items():
                total[fid] += ha
            mb += tamanho
            print(f"{i}/{len(cenas)} {cena} {tamanho} MB, {len(somas)} imoveis com vegetacao", flush=True)
    with open(SAIDA / "imovel_vegetacao.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["fid", "veg_ha"])
        for fid, ha in sorted(total.items()):
            w.writerow([fid, round(ha, 2)])
    print(f"COG: {mb:.0f} MB; imoveis com vegetacao: {len(total)}; total {sum(total.values()):,.0f} ha")


if __name__ == "__main__":
    main()
