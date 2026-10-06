"""Terapkan migrasi supabase/migrations/*.sql milik Civil Tools ke database Supabase.

    DATABASE_URL=postgresql://... python scripts/db_migrate.py --dry-run   # tampilkan yang akan diterapkan
    DATABASE_URL=postgresql://... python scripts/db_migrate.py             # terapkan

Kenapa bukan `supabase db push`: database dipakai bersama repo edifisia-platform, yang riwayatnya ada di
supabase_migrations.schema_migrations. CLI menolak push bila riwayat remote berisi versi yang tidak ada di
folder lokal — jadi push dari repo ini gagal, dan sebaliknya mencatat versi tools di sana akan menggagalkan
push repo platform. Riwayat repo ini dicatat terpisah di tools.schema_migrations.

Tiap migrasi diterapkan dalam transaksinya sendiri bersama baris riwayatnya (gagal = tidak ada yang berubah).
File yang sudah diterapkan tidak boleh diubah; perubahan selalu file baru. Butuh `psycopg2-binary`.
"""

import os
import pathlib
import re
import sys

import psycopg2

ROOT = pathlib.Path(__file__).resolve().parent.parent
HISTORY = """
create schema if not exists tools;
create table if not exists tools.schema_migrations (
  version     text primary key,
  name        text not null,
  applied_at  timestamptz not null default now()
);
revoke all on tools.schema_migrations from public;
"""


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL belum diisi", file=sys.stderr)
        return 2
    url = re.sub(r"^postgresql\+\w+://", "postgresql://", url)
    dry = "--dry-run" in sys.argv

    files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    conn = psycopg2.connect(url)
    try:
        with conn.cursor() as cur:
            cur.execute("select to_regclass('tools.schema_migrations') is not null")
            applied = set()
            if cur.fetchone()[0]:
                cur.execute("select version from tools.schema_migrations")
                applied = {r[0] for r in cur.fetchall()}
        conn.rollback()

        pending = [f for f in files if f.name.split("_", 1)[0] not in applied]
        if not pending:
            print("Tidak ada migrasi baru.")
            return 0
        for path in pending:
            version, name = path.stem.split("_", 1)
            if dry:
                print(f"akan diterapkan  {path.name}")
                continue
            with conn.cursor() as cur:
                cur.execute(HISTORY)
                cur.execute(path.read_text(encoding="utf-8"))
                cur.execute("insert into tools.schema_migrations (version, name) values (%s, %s)", (version, name))
            conn.commit()
            print(f"diterapkan  {path.name}")
    except psycopg2.Error as exc:
        conn.rollback()
        print(f"GAGAL: {exc.pgerror or exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
