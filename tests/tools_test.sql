-- Test skema tools. Dijalankan oleh tests/run.py dalam satu transaksi yang selalu di-ROLLBACK
-- (tidak meninggalkan data). Tiap blok DO gagal dengan pesan assert bila aturan dilanggar.
-- Butuh skema platform (repo edifisia-platform) sudah diterapkan: trial 7 hari diberikan trigger
-- platform saat user uji dibuat dengan email terkonfirmasi.

-- User uji (id tetap agar mudah dirujuk).
--  p: Premium (trial, email terkonfirmasi)
--  f: Free User (email belum terkonfirmasi -> tanpa trial), punya pekerjaan lama dari masa Premium
--  q: Premium lain, untuk uji isolasi antar-user
insert into auth.users (id, email, email_confirmed_at, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'uji-tools-p@contoh.test', now(), 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'uji-tools-f@contoh.test', null,  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a3', 'uji-tools-q@contoh.test', now(), 'authenticated', 'authenticated');

-- Data awal sebagai pemilik tabel (melewati RLS).
insert into tools.saved_works (id, user_id, tool_id, name, state_json) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a2', 'beam-flexure', 'Lama F', '{"b":"300"}'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a2', 'beam-flexure', 'Lama F 2', '{"b":"350"}'),
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a3', 'pile-capacity', 'Milik Q', '{"L":"12"}');

-- 0. Prasyarat ---------------------------------------------------------------------------------------------------------
do $$
begin
  assert platform.has_premium('00000000-0000-4000-8000-0000000000a1'), 'p harus Premium (trial) — skema platform terpasang?';
  assert not platform.has_premium('00000000-0000-4000-8000-0000000000a2'), 'f harus Free User';
end $$;

-- 1. Constraint data ---------------------------------------------------------------------------------------------------
do $$
declare u uuid := '00000000-0000-4000-8000-0000000000a3';
begin
  begin
    insert into tools.saved_works (user_id, tool_id, name, state_json) values (u, 'beam-flexure', '', '{}');
    assert false, 'nama kosong harus ditolak';
  exception when check_violation then null;
  end;
  begin
    insert into tools.saved_works (user_id, tool_id, name, state_json) values (u, 'beam-flexure', ' spasi ', '{}');
    assert false, 'nama dengan spasi tepi harus ditolak (klien wajib trim)';
  exception when check_violation then null;
  end;
  begin
    insert into tools.saved_works (user_id, tool_id, name, state_json) values (u, 'beam-flexure', repeat('x', 121), '{}');
    assert false, 'nama > 120 karakter harus ditolak';
  exception when check_violation then null;
  end;
  begin
    insert into tools.saved_works (user_id, tool_id, name, state_json) values (u, '../Beam', 'x', '{}');
    assert false, 'tool_id tidak valid harus ditolak';
  exception when check_violation then null;
  end;
  begin
    insert into tools.saved_works (user_id, tool_id, name, state_json) values (u, 'beam-flexure', 'x', '[1,2]');
    assert false, 'state_json bukan objek harus ditolak';
  exception when check_violation then null;
  end;
  begin
    insert into tools.saved_works (user_id, tool_id, name, state_json)
    values (u, 'beam-flexure', 'x', jsonb_build_object('k', repeat('x', 262144)));
    assert false, 'state_json > 256 KB harus ditolak';
  exception when check_violation then null;
  end;
end $$;

-- 2. Premium (p): simpan, timpa, ganti nama, baca hanya miliknya ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare w tools.saved_works; n int;
begin
  insert into tools.saved_works (tool_id, name, state_json)
  values ('beam-flexure', 'Balok B1', '{"b":"300","h":"600"}')
  returning * into w;
  assert w.user_id = '00000000-0000-4000-8000-0000000000a1', format('user_id harus auth.uid(), %s', w.user_id);
  assert w.created_at = now() and w.updated_at = now(), 'waktu harus diisi database';

  update tools.saved_works set state_json = '{"b":"400","h":"600"}', name = 'Balok B1 rev' where id = w.id;
  get diagnostics n = row_count;
  assert n = 1, 'Premium harus bisa menimpa pekerjaannya';

  select count(*) into n from tools.saved_works;
  assert n = 1, format('p hanya boleh melihat miliknya sendiri, terlihat %s', n);

  -- Pekerjaan user lain: tak terlihat, tak bisa ditimpa/dihapus (0 baris, tanpa galat).
  update tools.saved_works set name = 'dibajak' where id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  assert n = 0, 'p tidak boleh menimpa pekerjaan q';
  delete from tools.saved_works where id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  assert n = 0, 'p tidak boleh menghapus pekerjaan q';

  -- Kolom yang diisi database tidak boleh diisi/diubah klien.
  begin
    insert into tools.saved_works (user_id, tool_id, name, state_json)
    values ('00000000-0000-4000-8000-0000000000a3', 'beam-flexure', 'Titip ke q', '{}');
    assert false, 'klien tidak boleh mengisi user_id';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into tools.saved_works (tool_id, name, state_json, created_at)
    values ('beam-flexure', 'Mundur', '{}', now() - interval '1 year');
    assert false, 'klien tidak boleh mengisi created_at';
  exception when insufficient_privilege then null;
  end;
  begin
    update tools.saved_works set user_id = '00000000-0000-4000-8000-0000000000a3' where id = w.id;
    assert false, 'klien tidak boleh memindah pemilik';
  exception when insufficient_privilege then null;
  end;
  begin
    update tools.saved_works set created_at = now() - interval '1 year' where id = w.id;
    assert false, 'klien tidak boleh mengubah created_at';
  exception when insufficient_privilege then null;
  end;
  begin
    update tools.saved_works set tool_id = 'pile-capacity' where id = w.id;
    assert false, 'klien tidak boleh mengubah tool_id';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 3. Free User (f): buka & hapus miliknya, tidak bisa simpan/timpa ----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from tools.saved_works;
  assert n = 2, format('Free User harus tetap bisa membuka 2 pekerjaannya, terlihat %s', n);

  begin
    insert into tools.saved_works (tool_id, name, state_json) values ('beam-flexure', 'Baru', '{}');
    assert false, 'Free User tidak boleh menyimpan baru';
  exception when insufficient_privilege then null;   -- pelanggaran RLS = 42501
  end;

  update tools.saved_works set state_json = '{"b":"999"}' where id = '00000000-0000-4000-8000-0000000000f1';
  get diagnostics n = row_count;
  assert n = 0, 'Free User tidak boleh menimpa';

  delete from tools.saved_works where id = '00000000-0000-4000-8000-0000000000f2';
  get diagnostics n = row_count;
  assert n = 1, 'Free User harus bisa menghapus miliknya';
end $$;
reset role;

-- 4. Batas 50 per user (dihitung semua pekerjaan user, termasuk yang dibuat server) ----------------------------------
insert into tools.saved_works (user_id, tool_id, name, state_json)
select '00000000-0000-4000-8000-0000000000a1', 'development-length', 'Isi ' || g, '{}'
from generate_series(1, 49) g;   -- p sudah punya 1 dari blok 2 -> total 50

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare h text; n int;
begin
  select count(*) into n from tools.saved_works;
  assert n = 50, format('p harus punya 50, ada %s', n);
  begin
    insert into tools.saved_works (tool_id, name, state_json) values ('beam-flexure', 'Ke-51', '{}');
    assert false, 'pekerjaan ke-51 harus ditolak';
  exception when raise_exception then
    get stacked diagnostics h = pg_exception_hint;
    assert h = 'saved_works_limit', format('hint batas harus saved_works_limit, %s', h);
  end;

  -- Menimpa tetap boleh saat penuh; setelah menghapus satu, simpan baru boleh lagi.
  update tools.saved_works set state_json = '{"x":"1"}' where name = 'Isi 1';
  get diagnostics n = row_count;
  assert n = 1, 'menimpa harus tetap boleh saat batas tercapai';
  delete from tools.saved_works where name = 'Isi 2';
  insert into tools.saved_works (tool_id, name, state_json) values ('beam-flexure', 'Ke-50 lagi', '{}');
end $$;
reset role;

do $$
begin
  begin  -- batas juga berlaku untuk penulisan server
    insert into tools.saved_works (user_id, tool_id, name, state_json)
    values ('00000000-0000-4000-8000-0000000000a1', 'beam-flexure', 'Server ke-51', '{}');
    assert false, 'batas 50 juga berlaku untuk penulisan server';
  exception when raise_exception then null;
  end;
end $$;

-- 5. Anon: tidak punya akses sama sekali -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from tools.saved_works;
    assert false, 'anon tidak boleh membaca saved_works';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 6. Akun dihapus: pekerjaannya ikut terhapus -------------------------------------------------------------------------
do $$
begin
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000a3';
  assert not exists (select 1 from tools.saved_works where user_id = '00000000-0000-4000-8000-0000000000a3'),
         'pekerjaan q harus ikut terhapus';
end $$;

select 'tools_test: semua lulus' as hasil;
