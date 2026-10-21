-- 16/10/2026. O mapa trabalha so com os seis nucleos em execucao, a pedido do Gustavo.
-- 1. Na vista geral, toda camada com campo selecionado mostra so selecionado = 'Sim'.
--    Bioma e limite estadual, sem o campo, ficam inteiros como contexto.
-- 2. contornos_pdf(): estados e nucleos simplificados, em graus, para os mapinhas de
--    localizacao do PDF.

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
    zmin           integer;
    ponto          boolean;
    chaves         text[];
    colunas        text;
    colunas_ponto  text;
    lista_chaves   text;
    tem_nucleo     boolean;
    tem_selecao    boolean;
    filtro         text := '';
    -- Pixel de tela no zoom pedido (tile de 512 px do MapLibre).
    pixel          double precision := 40075016.68557849 / (512 * 2 ^ z);
    -- Metade de um pixel de 256: abaixo disso a simplificacao nao aparece.
    passo          double precision := 40075016.68557849 / (256 * 2 ^ z) / 2;
    saida          bytea;
begin
    select c.zoom_minimo, c.vira_ponto, coalesce(c.campos_ponto, array[]::text[])
      into zmin, ponto, chaves
      from vertentes.camadas c where c.camada = tile.camada;
    if not found then
        raise exception 'camada fora do catalogo: %', tile.camada using errcode = '22023';
    end if;
    if tile.nucleo is null and z < zmin then
        return ''::bytea;
    end if;

    select string_agg(format('t.%I', a.attname), ', ' order by a.attnum),
           string_agg(
               case when a.attname = any (chaves) then format('t.%I', a.attname)
                    else format('null::%s as %I', format_type(a.atttypid, a.atttypmod), a.attname) end,
               ', ' order by a.attnum),
           bool_or(a.attname = 'nucleo'),
           bool_or(a.attname = 'selecionado')
      into colunas, colunas_ponto, tem_nucleo, tem_selecao
      from pg_attribute a
     where a.attrelid = format('vertentes.%I', tile.camada)::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('geom', 'fid');

    if tile.nucleo is not null and tem_nucleo then
        filtro := ' and t.nucleo = $5';
    elsif tem_selecao then
        filtro := ' and t.selecionado = ''Sim''';
    end if;

    if not ponto then
        execute format(
            $q$
            with limite as (select st_tileenvelope($1, $2, $3) as e),
            feicoes as (
                select %s
                       st_asmvtgeom(case when $1 < 12 then st_simplify(t.geom, $4) else t.geom end,
                                    limite.e, 4096, 64, true) as geom
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
    end if;

    select coalesce(string_agg(format('t.%I', c), ', '), '1') into lista_chaves from unnest(chaves) c;

    -- Abaixo do zoom 10, a escala do nucleo inteiro, o poligono tambem so leva o campo da cor.
    -- Os atributos completos voltam ao aproximar, para a consulta por clique.
    if z < 10 then
        colunas := colunas_ponto;
    end if;

    execute format(
        $q$
        with limite as (select st_tileenvelope($1, $2, $3) as e),
        base as (
            select t.*, st_area(t.geom) < $6 as pequeno
              from vertentes.%1$I t, limite
             where t.geom && limite.e %2$s
        ),
        poligonos as (
            select %3$s
                   st_asmvtgeom(case when $1 < 12 then st_simplify(t.geom, $4) else t.geom end,
                                limite.e, 4096, 64, true) as geom
              from base t, limite
             where not t.pequeno
        ),
        pontos as (
            select distinct on (t.g, %5$s) %4$s
                   st_asmvtgeom(t.g, limite.e, 4096, 64, true) as geom
              from (select b.*, st_snaptogrid(st_centroid(b.geom), $7) as g
                      from base b where b.pequeno) t, limite
        )
        select st_asmvt(f, %6$L, 4096, 'geom')
          from (select * from poligonos union all select * from pontos) f
         where geom is not null
        $q$,
        tile.camada, filtro,
        coalesce(colunas || ',', ''), coalesce(colunas_ponto || ',', ''),
        lista_chaves, tile.camada
    )
    into saida
    using z, x, y, passo, tile.nucleo, (2 * pixel) ^ 2, pixel;

    return coalesce(saida, ''::bytea);
end
$fn$;

revoke all on function public.tile(text, integer, integer, integer, integer) from public, anon;
grant execute on function public.tile(text, integer, integer, integer, integer) to authenticated;

-- Contornos para os mapinhas de localizacao do PDF. GeoJSON em graus, bem simplificado:
-- o mapinha tem 4 cm de largura.
create or replace function public.contornos_pdf()
returns jsonb
language sql
stable
security definer
set search_path = extensions, vertentes, pg_temp
as $fn$
    select jsonb_build_object(
        'estados', (
            select jsonb_agg(jsonb_build_object(
                       'uf', sigla_uf,
                       'geometria', st_asgeojson(st_simplifypreservetopology(st_transform(geom, 4326), 0.05), 3)::jsonb))
              from vertentes.limite_estadual_malha_2025
        ),
        'nucleos', (
            select jsonb_agg(jsonb_build_object(
                       'nucleo', nucleo,
                       'nome', nome_nucleo,
                       'geometria', st_asgeojson(st_simplifypreservetopology(st_transform(geom, 4326), 0.01), 3)::jsonb)
                   order by nucleo)
              from vertentes.nucleos_malha_2025
             where selecionado = 'Sim'
        )
    );
$fn$;

revoke all on function public.contornos_pdf() from public, anon;
grant execute on function public.contornos_pdf() to authenticated;

notify pgrst, 'reload schema';
