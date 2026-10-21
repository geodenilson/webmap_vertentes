-- Esquema do webmap. As camadas ficam em vertentes, que a Data API nao expoe.
-- O mapa so enxerga as funcoes de tile em public, liberadas para quem tem login.

create extension if not exists postgis with schema extensions;

create schema if not exists vertentes;
revoke all on schema vertentes from public, anon, authenticated;

-- Catalogo das camadas publicadas. O mapa le daqui o nome, o tipo e o zoom minimo.
create table if not exists vertentes.camadas (
    camada        text primary key,
    titulo        text,
    tema          text,
    geometria     text,
    registros     integer,
    versao        text,
    fonte         text,
    descricao     text,
    zoom_minimo   smallint not null default 0,
    tolerancia_m  real,
    base          text not null,
    carregada_em  timestamptz not null default now()
);
alter table vertentes.camadas enable row level security;
