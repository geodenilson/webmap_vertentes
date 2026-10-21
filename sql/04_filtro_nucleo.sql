-- Filtro por nucleo no proprio tile.
-- Com nucleo informado, o tile so leva as feicoes daquele nucleo e o zoom minimo deixa de
-- valer: CAR, SIGEF e PRODES anual aparecem ja na escala do nucleo inteiro.
-- Sem nucleo, a vista dos nove, as camadas pesadas continuam fora abaixo do zoom minimo.
-- Bioma e limite estadual nao tem o campo nucleo e nunca sao filtrados.

drop function if exists public.tile(text, integer, integer, integer);

create or replace function public.tile(
    camada text, z integer, x integer, y integer, nucleo integer default null
)
returns "application/vnd.mapbox-vector-tile"
language plpgsql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
declare
    zmin        integer;
    colunas     text;
    tem_nucleo  boolean;
    filtro      text := '';
    -- Metade de um pixel de 256 no zoom pedido. Abaixo disso a simplificacao nao aparece.
    passo       double precision := 40075016.68557849 / (256 * 2 ^ z) / 2;
    saida       bytea;
begin
    select c.zoom_minimo into zmin from vertentes.camadas c where c.camada = tile.camada;
    if not found then
        raise exception 'camada fora do catalogo: %', tile.camada using errcode = '22023';
    end if;
    if tile.nucleo is null and z < zmin then
        return ''::bytea;
    end if;

    select string_agg(format('t.%I', a.attname), ', ' order by a.attnum),
           bool_or(a.attname = 'nucleo')
      into colunas, tem_nucleo
      from pg_attribute a
     where a.attrelid = format('vertentes.%I', tile.camada)::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('geom', 'fid');

    if tile.nucleo is not null and tem_nucleo then
        filtro := ' and t.nucleo = $5';
    end if;

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
             where t.geom && limite.e %s
        )
        select st_asmvt(feicoes, %L, 4096, 'geom') from feicoes where geom is not null
        $q$,
        coalesce(colunas || ',', ''), tile.camada, filtro, tile.camada
    )
    into saida
    using z, x, y, passo, tile.nucleo;

    return coalesce(saida, ''::bytea);
end
$fn$;

revoke all on function public.tile(text, integer, integer, integer, integer) from public, anon;
grant execute on function public.tile(text, integer, integer, integer, integer) to authenticated;

notify pgrst, 'reload schema';
