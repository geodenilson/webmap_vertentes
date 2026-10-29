// Gerado por _08_selecao_municipios.py: nao editar a mao.
// Um mapa por criterio da selecao de municipios (reuniao de 27/10/2026).
export const CAMADAS_SELECAO = [
  {
    "id": "sel_invasoras_densidade",
    "titulo": "Biodiversidade · Plantas invasoras: registros (por 100 km²)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Registros de plantas invasoras (por 100 km²)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#efece6",
        1e-09,
        "#9ecae1",
        0.12,
        "#6baed6",
        0.29,
        "#3182bd",
        0.68,
        "#08519c"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Zero",
        "#efece6"
      ],
      [
        "Acima de 0 a 0,12",
        "#9ecae1"
      ],
      [
        "0,12 a 0,29",
        "#6baed6"
      ],
      [
        "0,29 a 0,68",
        "#3182bd"
      ],
      [
        "0,68 a 22",
        "#08519c"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Registros de plantas invasoras (por 100 km²). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_invasoras_riqueza",
    "titulo": "Biodiversidade · Plantas invasoras: riqueza (espécies)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Plantas invasoras (espécies)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#efece6",
        1e-09,
        "#9ecae1",
        2.5,
        "#6baed6",
        4.5,
        "#3182bd",
        6.5,
        "#08519c"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Zero",
        "#efece6"
      ],
      [
        "1 a 2",
        "#9ecae1"
      ],
      [
        "3 a 4",
        "#6baed6"
      ],
      [
        "5 a 6",
        "#3182bd"
      ],
      [
        "7 a 82",
        "#08519c"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Plantas invasoras (espécies). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_pan_area",
    "titulo": "Biodiversidade · Espécies ameaçadas: área com PAN (%)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Área com PAN (%)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#c6dbef",
        14.0,
        "#9ecae1",
        61.0,
        "#6baed6",
        99.0,
        "#3182bd"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Até 14",
        "#c6dbef"
      ],
      [
        "14 a 61",
        "#9ecae1"
      ],
      [
        "61 a 99",
        "#6baed6"
      ],
      [
        "99 a 100",
        "#3182bd"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Área com PAN (%). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_pan_n",
    "titulo": "Biodiversidade · Espécies ameaçadas: número de PANs (nº)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "PANs (nº)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#c6dbef",
        1.5,
        "#9ecae1",
        2.5,
        "#6baed6",
        3.5,
        "#3182bd"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "0 a 1",
        "#c6dbef"
      ],
      [
        "2",
        "#9ecae1"
      ],
      [
        "3",
        "#6baed6"
      ],
      [
        "4 a 6",
        "#3182bd"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "PANs (nº). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_areas_prioritarias",
    "titulo": "Biodiversidade · Áreas prioritárias ponderadas pela classe (ha x classe)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Áreas prioritárias, ha x classe"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#c6dbef",
        5700.0,
        "#9ecae1",
        40000.0,
        "#6baed6",
        160000.0,
        "#3182bd",
        330000.0,
        "#08519c"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Até 5.700",
        "#c6dbef"
      ],
      [
        "5.700 a 40.000",
        "#9ecae1"
      ],
      [
        "40.000 a 160.000",
        "#6baed6"
      ],
      [
        "160.000 a 330.000",
        "#3182bd"
      ],
      [
        "330.000 a 1.446.004",
        "#08519c"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Áreas prioritárias, ha x classe. Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_vegetacao_nativa",
    "titulo": "Ambiental · Vegetação nativa remanescente (ha)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Vegetação nativa (ha)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#c7e9c0",
        6500.0,
        "#a1d99b",
        30000.0,
        "#74c476",
        75000.0,
        "#31a354",
        150000.0,
        "#006d2c"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Até 6.500",
        "#c7e9c0"
      ],
      [
        "6.500 a 30.000",
        "#a1d99b"
      ],
      [
        "30.000 a 75.000",
        "#74c476"
      ],
      [
        "75.000 a 150.000",
        "#31a354"
      ],
      [
        "150.000 a 676.790",
        "#006d2c"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Vegetação nativa (ha). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_area_protegida",
    "titulo": "Ambiental · Área protegida, UC e RPPN (ha)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Área protegida, UC e RPPN (ha)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#efece6",
        1e-09,
        "#a1d99b",
        76.0,
        "#74c476",
        2200.0,
        "#31a354",
        15000.0,
        "#006d2c"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Zero",
        "#efece6"
      ],
      [
        "Acima de 0 a 76",
        "#a1d99b"
      ],
      [
        "76 a 2.200",
        "#74c476"
      ],
      [
        "2.200 a 15.000",
        "#31a354"
      ],
      [
        "15.000 a 493.156",
        "#006d2c"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Área protegida, UC e RPPN (ha). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_passivo_car",
    "titulo": "Ambiental · Passivo de APP, RL e uso restrito (ha)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Passivo no CAR (ha)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#c7e9c0",
        1400.0,
        "#a1d99b",
        3200.0,
        "#74c476",
        7600.0,
        "#31a354",
        15000.0,
        "#006d2c"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Até 1.400",
        "#c7e9c0"
      ],
      [
        "1.400 a 3.200",
        "#a1d99b"
      ],
      [
        "3.200 a 7.600",
        "#74c476"
      ],
      [
        "7.600 a 15.000",
        "#31a354"
      ],
      [
        "15.000 a 326.651",
        "#006d2c"
      ],
      [
        "Sem dado",
        "#bdbdbd"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Passivo no CAR (ha). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_comites",
    "titulo": "Governança · Comitês de bacia (pontos)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Comitês de bacia (pontos)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#dadaeb",
        1.5,
        "#bcbddc",
        2.5,
        "#9e9ac8",
        3.5,
        "#756bb1",
        4.5,
        "#54278f"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "0 a 1",
        "#dadaeb"
      ],
      [
        "2",
        "#bcbddc"
      ],
      [
        "3",
        "#9e9ac8"
      ],
      [
        "4",
        "#756bb1"
      ],
      [
        "5 a 9",
        "#54278f"
      ],
      [
        "Sem dado",
        "#bdbdbd"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Comitês de bacia (pontos). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_governanca_gge",
    "titulo": "Governança · Governança GGE (pontos)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Governança GGE (pontos)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#efece6",
        1e-09,
        "#bcbddc",
        3.5,
        "#9e9ac8",
        5.5,
        "#756bb1",
        7.5,
        "#54278f"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Zero",
        "#efece6"
      ],
      [
        "1 a 3",
        "#bcbddc"
      ],
      [
        "4 a 5",
        "#9e9ac8"
      ],
      [
        "6 a 7",
        "#756bb1"
      ],
      [
        "8 a 30",
        "#54278f"
      ],
      [
        "Sem dado",
        "#bdbdbd"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Governança GGE (pontos). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_propriedades",
    "titulo": "Agropecuário · Propriedades (nº)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Propriedades (nº)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#fdd49e",
        61.0,
        "#fdbb84",
        150.0,
        "#fc8d59",
        290.0,
        "#e34a33",
        500.0,
        "#b30000"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Até 61",
        "#fdd49e"
      ],
      [
        "61 a 150",
        "#fdbb84"
      ],
      [
        "150 a 290",
        "#fc8d59"
      ],
      [
        "290 a 500",
        "#e34a33"
      ],
      [
        "500 a 2.862",
        "#b30000"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Propriedades (nº). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_bovinos",
    "titulo": "Agropecuário · Bovinos (cabeças)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Bovinos (cabeças)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#fdd49e",
        23000.0,
        "#fdbb84",
        41000.0,
        "#fc8d59",
        84000.0,
        "#e34a33",
        160000.0,
        "#b30000"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Até 23.000",
        "#fdd49e"
      ],
      [
        "23.000 a 41.000",
        "#fdbb84"
      ],
      [
        "41.000 a 84.000",
        "#fc8d59"
      ],
      [
        "84.000 a 160.000",
        "#e34a33"
      ],
      [
        "160.000 a 600.860",
        "#b30000"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Bovinos (cabeças). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_soja",
    "titulo": "Agropecuário · Soja (ha)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Soja (ha)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#fdd49e",
        600.0,
        "#fdbb84",
        2800.0,
        "#fc8d59",
        11000.0,
        "#e34a33",
        64000.0,
        "#b30000"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Até 600",
        "#fdd49e"
      ],
      [
        "600 a 2.800",
        "#fdbb84"
      ],
      [
        "2.800 a 11.000",
        "#fc8d59"
      ],
      [
        "11.000 a 64.000",
        "#e34a33"
      ],
      [
        "64.000 a 508.448",
        "#b30000"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Soja (ha). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_empresas_ater",
    "titulo": "Agropecuário · Empresas de ATER (nº)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Empresas de ATER (nº)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#fdd49e",
        4.5,
        "#fdbb84",
        10.5,
        "#fc8d59",
        15.5,
        "#e34a33",
        29.5,
        "#b30000"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "0 a 4",
        "#fdd49e"
      ],
      [
        "5 a 10",
        "#fdbb84"
      ],
      [
        "11 a 15",
        "#fc8d59"
      ],
      [
        "16 a 29",
        "#e34a33"
      ],
      [
        "30 a 168",
        "#b30000"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Empresas de ATER (nº). Classes pelos quantis dos 158 municípios dos seis núcleos."
  },
  {
    "id": "sel_pastagem_degradada",
    "titulo": "Agropecuário · Pastagem degradada, vigor baixo + médio (ha)",
    "tema": "selecao",
    "tipo": "fill",
    "pintura": {
      "fill-color": [
        "step",
        [
          "to-number",
          [
            "get",
            "Pastagem vigor baixo + médio (ha)"
          ],
          -1
        ],
        "#bdbdbd",
        0,
        "#fdd49e",
        3100.0,
        "#fdbb84",
        11000.0,
        "#fc8d59",
        34000.0,
        "#e34a33",
        85000.0,
        "#b30000"
      ],
      "fill-opacity": 0.8
    },
    "contorno": {
      "line-color": "#ffffff",
      "line-width": 0.6
    },
    "legenda": [
      [
        "Até 3.100",
        "#fdd49e"
      ],
      [
        "3.100 a 11.000",
        "#fdbb84"
      ],
      [
        "11.000 a 34.000",
        "#fc8d59"
      ],
      [
        "34.000 a 85.000",
        "#e34a33"
      ],
      [
        "85.000 a 317.894",
        "#b30000"
      ]
    ],
    "titulo_popup": "nm_mun",
    "rotulo": "nm_mun",
    "nota": "Pastagem vigor baixo + médio (ha). Classes pelos quantis dos 158 municípios dos seis núcleos."
  }
];
