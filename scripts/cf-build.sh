#!/usr/bin/env bash
# ============================================================
# Civil Tools — staging build untuk Cloudflare Pages / Netlify
# Menyalin HANYA berkas publik (whitelist sama seperti docs/DEPLOY.md
# untuk zip cPanel) ke folder dist/ — supaya file non-runtime di repo
# (docs/, .claude/, firebase/ rules, README, ARCHITECTURE.md, .git) TIDAK
# ikut ter-publish. App ini zero-build (HTML/CSS/JS murni), jadi skrip ini
# murni staging/copy, bukan proses compile.
#
# Dipakai sebagai "Build command" di Cloudflare Pages / Netlify:
#   bash scripts/cf-build.sh
# dengan "Build output directory" / "Publish directory" = dist
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist

# Berkas publik (persis daftar di docs/DEPLOY.md)
cp index.html sw.js manifest.json sitemap.xml robots.txt dist/
cp -r assets core modules favicon dist/

# SPA fallback + header cache khusus Cloudflare Pages/Netlify (setara .htaccess)
cp _redirects _headers dist/

echo "OK -> dist/ siap di-publish ($(find dist -type f | wc -l) berkas)"
