-- Google Drive storage: one encrypted refresh token per user.
create table if not exists public.drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_enc text not null,
  folder_id text,
  email text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.drive_connections enable row level security;

create policy "drive: read own" on public.drive_connections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "drive: insert own" on public.drive_connections
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "drive: update own" on public.drive_connections
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "drive: delete own" on public.drive_connections
  for delete to authenticated using (user_id = (select auth.uid()));

-- Playback proxy: the (AES-GCM encrypted) token of whoever owns a Drive-stored video.
-- Access to the video itself is checked in the app before this is called, and the
-- token is useless without the server-side DRIVE_TOKEN_KEY.
create or replace function public.drive_connection_for_video(vid uuid)
returns table (refresh_token_enc text, file_id text)
language sql stable security definer set search_path = public as $$
  select d.refresh_token_enc, substr(v.storage_path, 8)
  from public.videos v
  join public.drive_connections d on d.user_id = v.owner_id
  where v.id = vid and v.storage_path like 'gdrive:%';
$$;

revoke all on function public.drive_connection_for_video(uuid) from public;
grant execute on function public.drive_connection_for_video(uuid) to anon, authenticated;
