-- Ponto leve. Na escala do nucleo 3 o tile do passivo chegou a 5 MB porque cada ponto
-- levava todos os atributos. Agora o ponto leva so os campos da cor (e o nome, onde ha
-- poucos), e pontos da mesma classe no mesmo pixel viram um so.

alter table vertentes.camadas add column if not exists campos_ponto text[];

update vertentes.camadas set campos_ponto = case camada
    when 'car_passivo_2026_06' then array['classe']
    when 'car_imovel_2026_06' then array['mod_fiscal']
    when 'prodes_cerrado_anual_v20260717' then array['year']
    when 'prodes_caatinga_anual_v20260805' then array['year']
    when 'prodes_pantanal_anual_v20260717' then array['year']
    when 'unidades_conservacao_cnuc_2026_09' then array['categoria', 'grupo', 'nome_uc']
    when 'quilombolas' then array['fase', 'nm_comunid']
    when 'terras_indigenas' then array['terrai_nom']
    when 'florestas_publicas_cnfp_2024_ret20250717' then array['protecao']
    when 'areas_urbanizadas_ibge_2022_ed2026_08' then array['tipo']
    when 'assentamentos_federais' then array['nome_proje']
    when 'assentamentos_reconhecidos' then array['nome_proje']
    else array[]::text[]
end
where vira_ponto;

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
           bool_or(a.attname = 'nucleo')
      into colunas, colunas_ponto, tem_nucleo
      from pg_attribute a
     where a.attrelid = format('vertentes.%I', tile.camada)::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('geom', 'fid');

    if tile.nucleo is not null and tem_nucleo then
        filtro := ' and t.nucleo = $5';
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

notify pgrst, 'reload schema';
