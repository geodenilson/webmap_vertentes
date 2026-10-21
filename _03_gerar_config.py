# -*- coding: utf-8 -*-
"""Grava web/js/config.js com o endereco do Supabase e a chave publica, lidos do .env.

A chave publicavel foi feita para ficar no navegador: sem login ela nao le nenhuma camada,
porque as funcoes de tile so respondem ao papel authenticated. A senha do banco e a chave
secreta nunca entram neste arquivo.
"""

import json
import os

PASTA = os.path.dirname(os.path.abspath(__file__))


def main() -> None:
    valores = {}
    with open(os.path.join(PASTA, ".env"), encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                chave, valor = linha.split("=", 1)
                valores[chave.strip()] = valor.strip()
    chave = valores["SUPABASE_ANON_KEY"]
    if chave.startswith("sb_secret_"):
        raise SystemExit("a chave do .env e a secreta; use a publicavel")
    destino = os.path.join(PASTA, "web", "js", "config.js")
    with open(destino, "w", encoding="utf-8") as f:
        f.write("// Gerado por _03_gerar_config.py a partir do .env. Nao editar a mao.\n")
        f.write(f"export const SUPABASE_URL = {json.dumps(valores['SUPABASE_URL'].rstrip('/'))};\n")
        f.write(f"export const SUPABASE_CHAVE = {json.dumps(chave)};\n")
        f.write('export const BASE_OFICIAL = "Vertentes_nucleos_v20261004b.gpkg";\n')
    print(destino)


if __name__ == "__main__":
    main()
