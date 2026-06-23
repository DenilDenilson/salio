#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Uso:
  scripts/capture-odds.sh --slug=... --stake-url=... --stake-api-url=... --kickoff=... --title=... --competition=...

Campos requeridos:
  --slug           Nombre del JSON en src/content/matches, ejemplo australia-vs-rival
  --stake-url      URL publica del evento en Stake
  --stake-api-url  URL interna completa single-pre-event.json, incluyendo hidenseek
  --kickoff        Hora UTC ISO, ejemplo 2026-06-14T01:00:00.000Z
  --title          Titulo visible, ejemplo "Australia vs Rival"

Campos opcionales:
  --competition    Competicion visible, ejemplo "Mundial 2026"
  --home           Equipo local si no quieres inferirlo desde --title
  --away           Equipo visitante si no quieres inferirlo desde --title
  --save-raw-api   Ruta para guardar evidencia cruda local
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

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
require_arg "--stake-api-url" "$@"
require_arg "--kickoff" "$@"
require_arg "--title" "$@"

pnpm odds:capture -- "$@"
