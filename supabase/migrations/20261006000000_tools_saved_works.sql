-- Skema `tools` milik Civil Tools: pekerjaan tersimpan (Simpan Pekerjaan).
-- Bergantung pada skema `platform` (repo edifisia-platform) untuk platform.has_premium().
-- Aturan (docs/PLATFORM.md §2):
--   * Baca & hapus: hanya pemilik (Free User tetap bisa membuka & menghapus miliknya).
--   * Simpan baru & timpa: pemilik DAN Premium aktif (trial termasuk) — ditegakkan RLS, bukan browser.
--   * Maksimal 50 pekerjaan per user (trigger, pesan galat jelas untuk UI).
-- Riwayat migrasi repo ini dicatat di tools.schema_migrations oleh scripts/db_migrate.py
-- (BUKAN supabase_migrations.schema_migrations, yang dipakai repo platform).

create schema if not exists tools;

create table tools.saved_works (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool_id     text not null check (tool_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  name        text not null check (name = btrim(name) and length(name) between 1 and 120),
  -- Snapshot stash sessionStorage tool (core/works.js): objek {suffix: nilai}. Dibatasi 256 KB agar tabel
  -- tidak dipakai sebagai penyimpanan bebas; snapshot nyata hanya beberapa KB.
  state_json  jsonb not null check (jsonb_typeof(state_json) = 'object' and octet_length(state_json::text) <= 262144),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index saved_works_user_updated_idx on tools.saved_works (user_id, updated_at desc);

-- Trigger --------------------------------------------------------------------------------------------------------------

create function tools.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger saved_works_touch
  before update on tools.saved_works
  for each row execute function tools.touch_updated_at();

-- Batas 50 per user. Kunci advisory per user mencegah dua simpan bersamaan sama-sama lolos di 49.
-- HINT 'saved_works_limit' = penanda stabil untuk UI (pesan boleh berubah).
create function tools.enforce_saved_works_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtextextended('tools.saved_works:' || new.user_id::text, 0));
  select count(*) into n from tools.saved_works where user_id = new.user_id;
  if n >= 50 then
    raise exception 'Batas 50 pekerjaan tersimpan tercapai. Hapus pekerjaan lama untuk menyimpan yang baru.'
      using hint = 'saved_works_limit';
  end if;
  return new;
end
$$;

create trigger saved_works_limit
  before insert on tools.saved_works
  for each row execute function tools.enforce_saved_works_limit();

-- RLS & hak akses ------------------------------------------------------------------------------------------------------

alter table tools.saved_works enable row level security;

create policy saved_works_select_own on tools.saved_works
  for select to authenticated using (user_id = (select auth.uid()));

create policy saved_works_delete_own on tools.saved_works
  for delete to authenticated using (user_id = (select auth.uid()));

create policy saved_works_insert_premium on tools.saved_works
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select platform.has_premium()));

create policy saved_works_update_premium on tools.saved_works
  for update to authenticated
  using (user_id = (select auth.uid()) and (select platform.has_premium()))
  with check (user_id = (select auth.uid()));

-- Klien hanya boleh mengisi kolom isi; id/user_id/waktu diisi database (hak per kolom).
revoke all on tools.saved_works from public, anon, authenticated;
grant usage on schema tools to authenticated, service_role;
grant select, delete on tools.saved_works to authenticated;
grant insert (tool_id, name, state_json) on tools.saved_works to authenticated;
grant update (name, state_json) on tools.saved_works to authenticated;
grant all on tools.saved_works to service_role;

revoke execute on all functions in schema tools from public, anon, authenticated;
