"""Cenas Planet (F:/Vertentes/Planet_Vertentes, G1 a G194) em COG para o webmap.

Cada cena e PlanetScope de 4 bandas (B, G, R, N), 16 bits, pixel de cerca de 5 m, em
SIRGAS 2000, num quadrado de 0,5 grau. Para o mapa vira cor natural de 8 bits (R, G, B),
com o mesmo realce em todas as cenas para o mosaico nao ter emenda: linear entre os
percentis 2 e 98 de 30 cenas sorteadas, e gama 0,8.

O COG sai como a biblioteca maplibre-cog-protocol le no navegador: EPSG:3857, grade
GoogleMapsCompatible, blocos de 256, JPEG com mascara de 1 bit na borda. A imagem so
aparece no nivel do imovel, por isso poucas reducoes (ate o zoom 11).

Saida: _cache/planet_cog/G*.tif e _cache/planet_cog/cenas.csv (nome, retangulo, tamanho).
    python _05_planet_cog.py            todas as cenas que faltam
    python _05_planet_cog.py G10 G11    so essas
"""

import csv
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import rasterio

ORIGEM = Path(r"F:\Vertentes\Planet_Vertentes")
SAIDA = Path(__file__).resolve().parent / "_cache" / "planet_cog"
# Percentis 2 e 98 de 30 cenas (22/10/2026); o azul vai um pouco alem para tirar o tom roxo.
REALCE = [("R", 3, 160, 2076), ("G", 2, 324, 1340), ("B", 1, 120, 950)]
GAMA = 0.8
PARALELO = 4


def converter(origem: Path) -> dict:
    destino = SAIDA / origem.name
    vrt = SAIDA / f"{origem.stem}_8bit.vrt"
    if not destino.exists():
        args = ["gdal_translate", "-q", "-of", "VRT", "-ot", "Byte"]
        for i, (_, banda, minimo, maximo) in enumerate(REALCE, start=1):
            args += ["-b", str(banda), f"-scale_{i}", str(minimo), str(maximo), "1", "255"]
        args += ["-exponent", str(GAMA), "-a_nodata", "none", str(origem), str(vrt)]
        subprocess.run(args, check=True)
        temporario = destino.with_suffix(".parcial.tif")
        subprocess.run([
            "gdalwarp", "-q", "-overwrite", "-r", "cubic", "-dstalpha", "-multi",
            "-wo", "NUM_THREADS=2", "-of", "COG",
            "-co", "TILING_SCHEME=GoogleMapsCompatible", "-co", "BLOCKSIZE=256",
            "-co", "COMPRESS=JPEG", "-co", "QUALITY=85",
            "-co", "OVERVIEW_RESAMPLING=AVERAGE", "-co", "OVERVIEW_COUNT=4",
            "-co", "OVERVIEWS=IGNORE_EXISTING", "-co", "NUM_THREADS=2",
            str(vrt), str(temporario),
        ], check=True)
        temporario.replace(destino)
        vrt.unlink(missing_ok=True)
    with rasterio.open(origem) as r:
        oeste, sul, leste, norte = r.bounds
    return {"cena": origem.stem, "arquivo": destino.name, "oeste": oeste, "sul": sul,
            "leste": leste, "norte": norte, "mb": round(destino.stat().st_size / 1e6, 1)}


def main() -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)
    pedidas = set(sys.argv[1:])
    cenas = sorted(ORIGEM.glob("G*.tif"), key=lambda p: int(p.stem[1:]))
    if pedidas:
        cenas = [c for c in cenas if c.stem in pedidas]
    linhas = []
    with ThreadPoolExecutor(PARALELO) as fila:
        for i, linha in enumerate(fila.map(converter, cenas), start=1):
            linhas.append(linha)
            print(f"{i}/{len(cenas)} {linha['cena']} {linha['mb']} MB", flush=True)
    if not pedidas:
        with open(SAIDA / "cenas.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0]))
            w.writeheader()
            w.writerows(linhas)
    print(f"total {sum(l['mb'] for l in linhas):.0f} MB")


if __name__ == "__main__":
    main()
