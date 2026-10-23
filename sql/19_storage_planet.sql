-- Bucket privado das cenas Planet (COG). Quem tem login le; o mapa pede link assinado.
-- O envio usa o login de um usuario com permissao temporaria de escrita (20_*.sql cria e
-- remove essa permissao). Nenhuma chave secreta sai da maquina.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planet', 'planet', false, 104857600, array['image/tiff'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "planet: leitura com login" on storage.objects;
create policy "planet: leitura com login" on storage.objects
    for select to authenticated using (bucket_id = 'planet');
