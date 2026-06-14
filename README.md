# Salió

Sitio informativo para congelar cuotas prepartido de Stake y, después del
partido, mostrar qué selecciones salieron usando snapshots JSON versionados.

No realiza apuestas, no maneja dinero, no accede a cuentas de usuarios y no
automatiza acciones dentro de Stake. Solo captura cuotas públicas antes del
partido y las cruza con resultados deportivos finales.

## Estado Actual

- Web pública estática con Astro Content Collections.
- Fuente de verdad: `src/content/matches/*.json`.
- Captura prepartido: Stake con Playwright/CDP.
- Resultado post partido: ESPN summary JSON público, sin API key.
- Sin base de datos en el flujo público.
- Tests con fixtures y mocks; CI no debe llamar a Stake ni a ESPN.
- Snapshots actuales usan `schemaVersion: "2.0"` y `sportsData`.

## Flujo Operativo

### 1. Prepartido: Capturar Cuotas

Modo recomendado si ya tienes Chromium/Chrome abierto con remote debugging:

```bash
BROWSER_WS_ENDPOINT=http://127.0.0.1:9222 pnpm odds:capture -- \
  --slug=brasil-vs-marruecos \
  --stake-url="https://stake.pe/deportes/football/world/fifa-world-cup/brasil-vs-marruecos/event/21798325" \
  --kickoff="2026-06-13T22:00:00.000Z" \
  --title="Brasil vs Marruecos" \
  --competition="Mundial 2026"
```

Atajo equivalente:

```bash
BROWSER_WS_ENDPOINT=http://127.0.0.1:9222 pnpm odds:capture:cdp -- \
  --slug=brasil-vs-marruecos \
  --stake-url="https://stake.pe/deportes/football/world/fifa-world-cup/brasil-vs-marruecos/event/21798325" \
  --kickoff="2026-06-13T22:00:00.000Z" \
  --title="Brasil vs Marruecos" \
  --competition="Mundial 2026"
```

Modo alternativo visible, en una ventana Playwright propia:

```bash
pnpm odds:capture:headed -- \
  --slug=brasil-vs-marruecos \
  --stake-url="https://stake.pe/deportes/football/world/fifa-world-cup/brasil-vs-marruecos/event/21798325" \
  --kickoff="2026-06-13T22:00:00.000Z" \
  --title="Brasil vs Marruecos" \
  --competition="Mundial 2026"
```

Esto crea o actualiza `src/content/matches/<slug>.json` en fase
`odds_captured`.

### 2. Post Partido: Validar ESPN

Antes de escribir el resultado puedes validar que el `event-id` de ESPN
corresponde al snapshot:

```bash
pnpm espn:validate -- --slug=brasil-vs-marruecos --event-id=760419
```

La validación revisa:

- ID del evento.
- Equipos y orientación local/visitante.
- Liga esperada (`fifa.world` para Mundial).
- Kickoff dentro de tolerancia.
- Marcador disponible.

### 3. Post Partido: Finalizar Snapshot

```bash
pnpm match:finalize -- --slug=brasil-vs-marruecos --event-id=760419
```

Si el snapshot ya tiene `sportsData.eventId`, puedes omitir `--event-id`:

```bash
pnpm match:finalize -- --slug=brasil-vs-marruecos
```

La finalización:

- Lee ESPN summary JSON desde
  `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=<EVENT_ID>`.
- Guarda evidencia cruda en `data/evidence/espn/<event-id>.json`.
- Calcula SHA-256 del payload.
- Evalúa selecciones soportadas.
- Escribe el snapshot atómicamente.
- Preserva cuotas congeladas, IDs de mercado, IDs de selección y odds.

## JSON De Snapshot

Estructura resumida:

```json
{
  "schemaVersion": "2.0",
  "slug": "brasil-vs-marruecos",
  "title": "Brasil vs Marruecos",
  "competitionName": "Mundial 2026",
  "timezone": "America/Lima",
  "homeTeamName": "Brasil",
  "awayTeamName": "Marruecos",
  "kickoffAt": "2026-06-13T22:00:00.000Z",
  "phase": "finalized",
  "stake": {
    "eventUrl": "https://stake.pe/...",
    "eventId": "21798325"
  },
  "sportsData": {
    "provider": "espn",
    "eventId": "760419",
    "leagueSlug": "fifa.world",
    "sourceUrl": "https://site.api.espn.com/..."
  },
  "odds": {
    "source": "stake",
    "capturedAt": "2026-06-13T21:08:03.608Z",
    "frozen": true,
    "markets": []
  },
  "result": {
    "evidence": {
      "provider": "espn",
      "eventId": "760419",
      "sourceUrl": "https://site.api.espn.com/...",
      "fetchedAt": "2026-06-14T00:01:00.000Z",
      "payloadSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rawArtifactPath": "data/evidence/espn/760419.json"
    },
    "status": "FINISHED",
    "score": { "home": 1, "away": 1, "halftimeHome": 1, "halftimeAway": 1 },
    "events": [],
    "teamStatistics": { "home": {}, "away": {} },
    "playerStats": {}
  },
  "metadata": {
    "createdAt": "2026-06-13T21:08:03.608Z",
    "finalizedAt": "2026-06-14T00:05:00.000Z",
    "lastEvaluatedAt": "2026-06-14T00:05:00.000Z"
  }
}
```

## Mercados

P0 funcional:

- Resultado 1X2.
- Doble oportunidad.
- Draw no bet.
- Totales de goles.
- Ambos equipos anotan.
- Primer equipo en anotar.
- Córners totales.
- Tarjetas amarillas totales/equipo.
- Goleador anytime.
- Tiros al arco de jugador.

Mercados sin datos confiables quedan `unsupported`. `HANDICAP` está
deshabilitado hasta tener una implementación completa.

## Scripts

```bash
pnpm dev
pnpm build
pnpm check
pnpm lint
pnpm format:check
pnpm test
pnpm test:coverage
pnpm test:e2e

pnpm odds:capture -- --slug=... --stake-url=... --kickoff=... --title=...
pnpm odds:capture:cdp -- --slug=... --stake-url=... --kickoff=... --title=...
pnpm odds:capture:headed -- --slug=... --stake-url=... --kickoff=... --title=...
pnpm espn:validate -- --slug=... --event-id=...
pnpm match:finalize -- --slug=... --event-id=...
pnpm snapshots:migrate:v2
```

## Variables De Entorno

```bash
ESPN_BASE_URL=https://site.api.espn.com/apis/site/v2/sports/soccer
ESPN_LEAGUE_SLUG=fifa.world
ESPN_REQUEST_TIMEOUT_MS=30000
STAKE_ALLOWED_HOSTS=stake.pe
STAKE_IMPORT_TIMEOUT_MS=45000
STAKE_IMPORT_HEADLESS=true
BROWSER_WS_ENDPOINT=http://127.0.0.1:9222
```

ESPN no requiere API key. `BROWSER_WS_ENDPOINT` solo aplica al modo CDP de
Stake.

## Migración

Snapshots `schemaVersion: "1.0"` se migran con:

```bash
pnpm snapshots:migrate:v2
```

El migrador lee el campo histórico de API-Football si existe, pero el modelo
activo ya no usa API-Football. El contrato activo es `sportsData`.

## Testing

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
```

Regla de CI: los tests deben usar fixtures/mocks. No deben llamar realmente a
Stake ni a ESPN.

## Decisiones

- [0002: Static post-match snapshots](docs/decisions/0002-static-post-match-snapshots.md)
- [0003: Stake live capture browser modes](docs/decisions/0003-stake-live-capture-browser-modes.md)
- [0005: ESPN post-match provider](docs/decisions/0005-espn-summary-post-match-provider.md)
