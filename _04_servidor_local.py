# -*- coding: utf-8 -*-
"""Serve a pasta web/ em http://127.0.0.1:8017 sem cache.

O http.server do Python nao manda Cache-Control, e o Chrome reaproveita CSS e JS antigos
por conta propria: depois de uma mudanca, o mapa abria com a folha de estilo velha.
Aqui todo arquivo vai com Cache-Control: no-cache, que obriga o navegador a conferir a
versao a cada carga.

Uso:
    python _04_servidor_local.py
"""

import functools
import http.server
import os

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
PORTA = 8017


class SemCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main() -> None:
    manipulador = functools.partial(SemCache, directory=PASTA)
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORTA), manipulador) as servidor:
        print(f"mapa em http://127.0.0.1:{PORTA}", flush=True)
        servidor.serve_forever()


if __name__ == "__main__":
    main()
