# Salió

Sitio informativo para congelar cuotas prepartido de Stake y, después del
partido, mostrar qué selecciones salieron usando snapshots JSON versionados.

No realiza apuestas, no maneja dinero, no accede a cuentas de usuarios y no
automatiza acciones dentro de Stake. Solo captura cuotas públicas antes del
partido y las cruza con resultados deportivos finales.

## Estado Actual

- Web pública estática con Astro Content Collections.
- Fuente de verdad: `src/content/matches/*.json`.
- Captura prepartido: Stake API-only desde una URL interna
  `single-pre-event.json` provista en cada ejecución.
- Resultado post partido: ESPN summary JSON público, sin API key.
- Sin base de datos en el flujo público.
- Tests con fixtures y mocks; CI no debe llamar a Stake ni a ESPN.
- Snapshots actuales usan `schemaVersion: "2.0"` y `sportsData`.

## Flujo Operativo

### 1. Prepartido: Capturar Cuotas

El flujo recibe dos URLs:

- `--stake-url`: URL pública del evento en Stake; de aquí se extrae el
  `eventId`.
- `--stake-api-url`: URL interna completa de
  `single-pre-event.json`, incluyendo host dinámico, `eventId`, query string e
  `hidenseek`.

La URL interna es obligatoria en cada ejecución. El sistema no la construye, no
la corrige, no la descubre, no la completa y no la reutiliza entre partidos.
Solo valida HTTPS, allowlist de host y que el `eventId` coincida.

Modo recomendado:

```bash
pnpm odds:capture -- \
  --slug=espana-vs-cabo-verde \
  --stake-url="https://stake.pe/deportes/football/world/fifa-world-cup/espana-vs-cabo-verde/event/21798330" \
  --stake-api-url="$STAKE_EVENT_API_URL" \
  --kickoff="2026-06-15T16:00:00.000Z" \
  --title="España vs Cabo Verde" \
  --competition="Mundial 2026"
```

El valor de `hidenseek` nunca debe hardcodearse en el repo.

Para guardar evidencia cruda del payload, sin modificarlo:

```bash
pnpm odds:capture -- \
  --slug=espana-vs-cabo-verde \
  --stake-url="https://stake.pe/deportes/football/world/fifa-world-cup/espana-vs-cabo-verde/event/21798330" \
  --stake-api-url="$STAKE_EVENT_API_URL" \
  --save-raw-api="data/evidence/stake-api/21798330.json" \
  --kickoff="2026-06-15T16:00:00.000Z" \
  --title="España vs Cabo Verde" \
  --competition="Mundial 2026"
```

Esto crea o actualiza `src/content/matches/<slug>.json` en fase
`odds_captured`.

El script rechaza sobrescribir snapshots ya finalizados.

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

Clasificación API-first por `odd_code`:

| `odd_code`                       | Mercado                               |
| -------------------------------- | ------------------------------------- |
| `ODD_S1`, `ODD_SX`, `ODD_S2`     | Resultado 1X2                         |
| `ODD_D1X`, `ODD_D12`, `ODD_DX2`  | Doble oportunidad                     |
| `ODD_DRAWNOBET_*`                | Draw no bet                           |
| `ODD_TTL_*`                      | Totales del partido                   |
| `ODD_INDTTL1_*`, `ODD_INDTTL2_*` | Totales por equipo                    |
| `ODD_HT1_TTL_*`                  | Total primer tiempo                   |
| `ODD_FTB_BOTHTEAMSSCORE_*`       | Ambos equipos marcan                  |
| `ODD_SCORES_*`                   | Marcador exacto                       |
| `ODD_HND_*`                      | Handicap, conservado pero no evaluado |
| `ODD_YEL_TTL_*`                  | Total tarjetas amarillas              |
| `ODD_CRN_TTL_*`                  | Total corners                         |
| `ODD_PLR_SHOTSONTARGET_*`        | Tiros a puerta por jugador            |
| `ODD_SPLR_SCORES_PLAYER`         | Goleador anytime                      |
| `ODD_FTB_2HALVES_*`              | Conservado como `UNSUPPORTED`         |

Mercados desconocidos o sin evaluación segura quedan `UNSUPPORTED`, pero se
conservan con cuota y metadatos para revisión.

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

pnpm odds:capture -- --slug=... --stake-url=... --stake-api-url=... --kickoff=... --title=...
pnpm stake:diagnose -- --stake-url=... --stake-api-url=...
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
STAKE_API_ALLOWED_HOSTS=.websbkt.com
STAKE_API_TIMEOUT_MS=15000
STAKE_SAVE_RAW_RESPONSES=false
```

ESPN no requiere API key.

`STAKE_API_ALLOWED_HOSTS=.websbkt.com` permite subdominios reales de
`websbkt.com` sin permitir hosts como `websbkt.com.attacker.example`.

## Diagnóstico Stake API

La API de Stake usada para cuotas prepartido es interna y puede cambiar. Si una
captura falla:

- Confirma que la URL pública contenga `/event/<id>`.
- Confirma que la URL interna completa apunte a ese mismo `<id>`.
- Confirma que el host esté permitido por `STAKE_API_ALLOWED_HOSTS`.
- Si el token `hidenseek` venció o cambió, obtén una URL interna nueva desde
  DevTools y vuelve a ejecutar.
- Guarda evidencia local con `--save-raw-api=...`.
- Los mensajes y evidencias sanitizan `hidenseek`; no pegues tokens en commits,
  issues ni documentación.

Para comparar transporte Node `fetch` vs `curl` con exactamente la misma URL:

```bash
pnpm stake:diagnose -- \
  --stake-url="https://stake.pe/deportes/football/world/fifa-world-cup/espana-vs-cabo-verde/event/21798330" \
  --stake-api-url="$STAKE_EVENT_API_URL"
```

El diagnóstico solo imprime transporte, status HTTP, content-type, tamaño de
respuesta y URL censurada. La captura principal usa `curl` internamente porque
replica mejor los headers aceptados por Stake.

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
- [0006: Stake API-only odds capture](docs/decisions/0006-stake-api-first-odds-capture.md)
