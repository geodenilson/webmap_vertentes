-- Feicao menor que dois pixels na escala do tile vira ponto.
-- Na escala do nucleo inteiro um pixel passa de meio quilometro e metade das manchas de APP
-- do nucleo 2 tem menos de 0,73 ha: sem isso o passivo some do mapa. Ao aproximar, o ponto
-- volta a ser poligono. O mapa desenha o ponto com a mesma cor da classe.
-- So nas camadas de feicao pequena. Limite e mapeamento regional ficam como estao.

alter table vertentes.camadas add column if not exists vira_ponto boolean not null default false;

update vertentes.camadas set vira_ponto = (camada in (
    'car_passivo_2026_06', 'car_imovel_2026_06',
    'sigef_privado', 'sigef_publico', 'snci_privado', 'snci_publico',
    'prodes_cerrado_anual_v20260717', 'prodes_caatinga_anual_v20260805', 'prodes_pantanal_anual_v20260717',
    'prodes_cerrado_acumulado_v20260717', 'prodes_caatinga_acumulado_v20260805', 'prodes_pantanal_acumulado_v20260717',
    'asv_sinaflor', 'embargos_ibama', 'embargos_icmbio_2026_10',
    'unidades_conservacao_cnuc_2026_09', 'quilombolas', 'terras_indigenas',
    'assentamentos_federais', 'assentamentos_reconhecidos',
    'areas_urbanizadas_ibge_2022_ed2026_08', 'massa_dagua_bc250_2025',
    'florestas_publicas_cnfp_2024_ret20250717'
));

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
    ponto       boolean;
    colunas     text;
    tem_nucleo  boolean;
    filtro      text := '';
    desenho     text;
    -- Pixel de tela no zoom pedido (tile de 512 px do MapLibre).
    pixel       double precision := 40075016.68557849 / (512 * 2 ^ z);
    -- Metade de um pixel de 256: abaixo disso a simplificacao nao aparece.
    passo       double precision := 40075016.68557849 / (256 * 2 ^ z) / 2;
    saida       bytea;
begin
    select c.zoom_minimo, c.vira_ponto into zmin, ponto
      from vertentes.camadas c where c.camada = tile.camada;
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

    desenho := 'st_asmvtgeom(case when $1 < 12 then st_simplify(t.geom, $4) else t.geom end, limite.e, 4096, 64, true)';
    if ponto then
        desenho := format(
            'case when st_area(t.geom) < $6 then st_asmvtgeom(st_centroid(t.geom), limite.e, 4096, 64, true) else %s end',
            desenho
        );
    end if;

    execute format(
        $q$
        with limite as (select st_tileenvelope($1, $2, $3) as e),
        feicoes as (
            select %s %s as geom
              from vertentes.%I t, limite
             where t.geom && limite.e %s
        )
        select st_asmvt(feicoes, %L, 4096, 'geom') from feicoes where geom is not null
        $q$,
        coalesce(colunas || ',', ''), desenho, tile.camada, filtro, tile.camada
    )
    into saida
    using z, x, y, passo, tile.nucleo, (2 * pixel) ^ 2;

    return coalesce(saida, ''::bytea);
end
$fn$;

revoke all on function public.tile(text, integer, integer, integer, integer) from public, anon;
grant execute on function public.tile(text, integer, integer, integer, integer) to authenticated;

-- O mapa precisa saber quais camadas mandam ponto, para desenhar o circulo.
drop function if exists public.camadas_webmap();
create or replace function public.camadas_webmap()
returns table (
    camada text, titulo text, tema text, geometria text, registros integer,
    versao text, fonte text, descricao text, zoom_minimo smallint, vira_ponto boolean, base text
)
language sql
stable
security definer
set search_path = vertentes, pg_temp
as $fn$
    select camada, titulo, tema, geometria, registros, versao, fonte, descricao,
           zoom_minimo, vira_ponto, base
      from vertentes.camadas
     order by tema nulls last, titulo;
$fn$;
revoke all on function public.camadas_webmap() from public, anon;
grant execute on function public.camadas_webmap() to authenticated;

notify pgrst, 'reload schema';
