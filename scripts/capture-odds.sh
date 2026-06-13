#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Uso:
  scripts/capture-odds.sh cdp --slug=... --stake-url=... --kickoff=... --title=... --competition=...
  scripts/capture-odds.sh headed --slug=... --stake-url=... --kickoff=... --title=... --competition=...

Modos:
  cdp
    Se conecta a un Chromium/Chrome ya abierto en http://127.0.0.1:9222.
    Recomendado para Stake porque reutiliza cookies, sesion y modales aceptados.

    Antes, en otra terminal:
      chromium --remote-debugging-port=9222 --user-data-dir=/tmp/stake-capture

  headed
    Abre un Chromium visible controlado por Playwright.
    Es mas comodo porque no requiere abrir Chromium antes.

Campos requeridos:
  --slug          Nombre del JSON en src/content/matches, ejemplo australia-vs-rival
  --stake-url     URL publica del evento en Stake
  --kickoff       Hora UTC ISO, ejemplo 2026-06-14T01:00:00.000Z
  --title         Titulo visible, ejemplo "Australia vs Rival"

Campos opcionales:
  --competition   Competicion visible, ejemplo "Mundial 2026"
  --home          Equipo local si no quieres inferirlo desde --title
  --away          Equipo visitante si no quieres inferirlo desde --title
EOF
}

mode="${1:-}"
if [[ -z "$mode" || "$mode" == "-h" || "$mode" == "--help" ]]; then
  usage
  exit 0
fi

shift

require_arg() {
  local key="$1"
  shift
  for arg in "$@"; do
    if [[ "$arg" == "$key" || "$arg" == "$key="* ]]; then
      return 0
    fi
  done
  echo "Falta $key" >&2
  usage >&2
  exit 1
}

require_arg "--slug" "$@"
require_arg "--stake-url" "$@"
require_arg "--kickoff" "$@"
require_arg "--title" "$@"

case "$mode" in
  cdp)
    BROWSER_WS_ENDPOINT="${BROWSER_WS_ENDPOINT:-http://127.0.0.1:9222}" \
      pnpm odds:capture -- "$@"
    ;;
  headed)
    pnpm odds:capture -- "$@" --headed
    ;;
  *)
    echo "Modo invalido: $mode" >&2
    usage >&2
    exit 1
    ;;
esac
