"""Jalankan test skema tools terhadap database Supabase, dalam satu transaksi yang selalu di-ROLLBACK.

    DATABASE_URL=postgresql://... python tests/run.py            # migrasi + test (skema tools belum ada)
    DATABASE_URL=postgresql://... python tests/run.py --applied  # test saja (migrasi sudah diterapkan)

Tidak ada yang tersimpan: migrasi, user uji, dan semua data uji hilang saat rollback. Butuh `psycopg2-binary`
dan skema `platform` (repo edifisia-platform) sudah diterapkan di database yang sama. Pola sama dengan
tests/run.py di repo platform.
"""

import os
import pathlib
import re
import sys

import psycopg2

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL belum diisi", file=sys.stderr)
        return 2
    url = re.sub(r"^postgresql\+\w+://", "postgresql://", url)

    scripts = [] if "--applied" in sys.argv else sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    scripts.append(ROOT / "tests" / "tools_test.sql")

    conn = psycopg2.connect(url)
    conn.notices.clear()
    try:
        with conn.cursor() as cur:
            for path in scripts:
                cur.execute(path.read_text(encoding="utf-8"))
                print(f"ok  {path.relative_to(ROOT)}")
            print(cur.fetchone()[0])
    except psycopg2.Error as exc:
        print(f"GAGAL: {exc.pgerror or exc}", file=sys.stderr)
        return 1
    finally:
        conn.rollback()
        for notice in conn.notices:
            print(notice.strip())
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
