"""Sobe os COG das cenas Planet para o bucket privado planet e registra as cenas no banco.

O envio usa o login de um usuario da equipe. E-mail e senha vem do ambiente do terminal
(WEBMAP_EMAIL e WEBMAP_SENHA), nunca de arquivo. Durante o envio existe uma permissao de
escrita no bucket so para esse usuario; ela e removida no fim, mesmo se der erro.
O curl usado e o do Windows, que confia nos certificados da rede (schannel).

    $env:WEBMAP_EMAIL = "..."; $env:WEBMAP_SENHA = "..."
    python _06_subir_planet.py              imagens (raiz do bucket)
    python _06_subir_planet.py vegetacao    COG da vegetacao (pasta vegetacao/) e a tabela
                                            de hectares por imovel
"""

import csv
import json
import os
import subprocess
import sys
import time
from pathlib import Path

PASTA = Path(__file__).resolve().parent
CURL = r"C:\Windows\System32\curl.exe"
MODO = sys.argv[1] if len(sys.argv) > 1 else "imagens"
COGS = PASTA / "_cache" / ("vegetacao_cog" if MODO == "vegetacao" else "planet_cog")
PREFIXO = "vegetacao/" if MODO == "vegetacao" else ""
# Uma permissao por modo: os dois envios podem rodar juntos sem um fechar a do outro.
POLITICA = f"planet: envio temporario {MODO}"


def ler_env():
    valores = {}
    for linha in (PASTA / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.startswith("#"):
            k, v = linha.split("=", 1)
            valores[k.strip()] = v.strip()
    return valores


def psql(url, sql):
    r = subprocess.run(["psql", f"--dbname={url}", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()


def entrar(env):
    corpo = json.dumps({"email": os.environ["WEBMAP_EMAIL"], "password": os.environ["WEBMAP_SENHA"]})
    r = subprocess.run([CURL, "-s", "--ssl-no-revoke", "-X", "POST",
                        f"{env['SUPABASE_URL']}/auth/v1/token?grant_type=password",
                        "-H", f"apikey: {env['SUPABASE_ANON_KEY']}", "-H", "Content-Type: application/json",
                        "--data-binary", "@-"], input=corpo, capture_output=True, text=True, check=True)
    dados = json.loads(r.stdout)
    if "access_token" not in dados:
        raise SystemExit(f"login falhou: {dados.get('error_description') or dados.get('msg')}")
    return dados["access_token"], dados["user"]["id"]


def enviar(env, token, arquivo: Path) -> str:
    r = subprocess.run([CURL, "-s", "--ssl-no-revoke", "-o", "NUL", "-w", "%{http_code}", "-X", "POST",
                        f"{env['SUPABASE_URL']}/storage/v1/object/planet/{PREFIXO}{arquivo.name}",
                        "-H", f"apikey: {env['SUPABASE_ANON_KEY']}", "-H", f"Authorization: Bearer {token}",
                        "-H", "Content-Type: image/tiff", "-H", "x-upsert: true",
                        "-H", "Cache-Control: max-age=31536000",
                        "--data-binary", f"@{arquivo}"], capture_output=True, text=True)
    return r.stdout.strip()


def registrar_cenas(url):
    linhas = list(csv.DictReader(open(COGS / "cenas.csv", encoding="utf-8")))
    valores = ",\n".join(
        f"('{l['cena']}', '{l['arquivo']}', st_transform(st_makeenvelope({l['oeste']}, {l['sul']}, "
        f"{l['leste']}, {l['norte']}, 4326), 3857))"
        for l in linhas)
    psql(url, "insert into vertentes.planet_cenas (cena, arquivo, geom) values "
              f"{valores} on conflict (cena) do update set arquivo = excluded.arquivo, geom = excluded.geom;")
    return len(linhas)


def main():
    env = ler_env()
    url = env["DATABASE_URL"]
    token, uid = entrar(env)
    ja = set(psql(url, "select name from storage.objects where bucket_id = 'planet';").splitlines())
    arquivos = sorted((a for a in COGS.glob("G*.tif") if a.stem[1:].isdigit()), key=lambda p: int(p.stem[1:]))
    # Arquivo mexido no ultimo minuto pode estar sendo gravado: fica para a proxima rodada.
    agora = time.time()
    faltam = [a for a in arquivos if PREFIXO + a.name not in ja and agora - a.stat().st_mtime > 60]
    print(f"{len(arquivos)} cenas, {len(ja)} ja no bucket, {len(faltam)} para enviar", flush=True)

    psql(url, f'drop policy if exists "{POLITICA}" on storage.objects; '
              f'create policy "{POLITICA}" on storage.objects for all to authenticated '
              f"using (bucket_id = 'planet' and auth.uid() = '{uid}') "
              f"with check (bucket_id = 'planet' and auth.uid() = '{uid}');")
    try:
        falhas = []
        for i, arq in enumerate(faltam, start=1):
            if i % 40 == 0:
                token, _ = entrar(env)
            codigo = enviar(env, token, arq)
            if codigo not in ("200", "201"):
                codigo = enviar(env, token, arq)
            if codigo not in ("200", "201"):
                falhas.append((arq.name, codigo))
            print(f"{i}/{len(faltam)} {arq.name} {arq.stat().st_size / 1e6:.1f} MB -> {codigo}", flush=True)
    finally:
        psql(url, f'drop policy if exists "{POLITICA}" on storage.objects;')
        print("permissao temporaria removida", flush=True)

    if MODO == "vegetacao":
        csv_ha = COGS / "imovel_vegetacao.csv"
        if csv_ha.exists():
            subprocess.run(["psql", f"--dbname={url}", "-v", "ON_ERROR_STOP=1",
                            "-c", "truncate vertentes.imovel_vegetacao;",
                            "-c", f"\\copy vertentes.imovel_vegetacao (fid, veg_ha) from '{csv_ha.as_posix()}' csv header"],
                           check=True)
            print("hectares de vegetacao por imovel carregados")
    else:
        print(f"cenas registradas no banco: {registrar_cenas(url)}")
    if falhas:
        print("falharam:", falhas)


if __name__ == "__main__":
    main()
