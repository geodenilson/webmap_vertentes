-- Entrega das camadas ao mapa, em vector tiles (ST_AsMVT).
-- O mapa pede /rest/v1/rpc/tile?camada=...&z=...&x=...&y=... com o token do login.
-- A funcao so le camada registrada em vertentes.camadas, e abaixo do zoom minimo
-- devolve tile vazio, para o CAR e o PRODES nao serem pedidos na escala do Brasil.

-- Tipo de resposta que o PostgREST serve como application/vnd.mapbox-vector-tile.
do $$
begin
    if not exists (select 1 from pg_type where typname = 'application/vnd.mapbox-vector-tile') then
        create domain "application/vnd.mapbox-vector-tile" as bytea;
    end if;
end
$$;

create or replace function public.tile(camada text, z integer, x integer, y integer)
returns "application/vnd.mapbox-vector-tile"
language plpgsql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
declare
    zmin    integer;
    colunas text;
    -- Metade de um pixel de 256 no zoom pedido. Abaixo disso a simplificacao nao aparece.
    passo   double precision := 40075016.68557849 / (256 * 2 ^ z) / 2;
    saida   bytea;
begin
    select c.zoom_minimo into zmin from vertentes.camadas c where c.camada = tile.camada;
    if not found then
        raise exception 'camada fora do catalogo: %', tile.camada using errcode = '22023';
    end if;
    if z < zmin then
        return ''::bytea;
    end if;

    select string_agg(format('t.%I', a.attname), ', ' order by a.attnum)
      into colunas
      from pg_attribute a
     where a.attrelid = format('vertentes.%I', tile.camada)::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('geom', 'fid');

    execute format(
        $q$
        with limite as (select st_tileenvelope($1, $2, $3) as e),
        feicoes as (
            select %s
                   st_asmvtgeom(
                       case when $1 < 12 then st_simplify(t.geom, $4) else t.geom end,
                       limite.e, 4096, 64, true
                   ) as geom
              from vertentes.%I t, limite
             where t.geom && limite.e
        )
        select st_asmvt(feicoes, %L, 4096, 'geom') from feicoes where geom is not null
        $q$,
        coalesce(colunas || ',', ''), tile.camada, tile.camada
    )
    into saida
    using z, x, y, passo;

    return coalesce(saida, ''::bytea);
end
$fn$;

-- Catalogo para o painel de camadas do mapa.
create or replace function public.camadas_webmap()
returns table (
    camada text, titulo text, tema text, geometria text, registros integer,
    versao text, fonte text, descricao text, zoom_minimo smallint, base text
)
language sql
stable
security definer
set search_path = vertentes, pg_temp
as $fn$
    select camada, titulo, tema, geometria, registros, versao, fonte, descricao, zoom_minimo, base
      from vertentes.camadas
     order by tema nulls last, titulo;
$fn$;

revoke all on function public.tile(text, integer, integer, integer) from public, anon;
revoke all on function public.camadas_webmap() from public, anon;
grant execute on function public.tile(text, integer, integer, integer) to authenticated;
grant execute on function public.camadas_webmap() to authenticated;

notify pgrst, 'reload schema';
