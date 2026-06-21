# Salió

Pipeline de automatización para congelar cuotas prepartido, esperar resultados
oficiales y publicar una web estática con qué selecciones salieron.

Este repositorio no intenta ser una casa de apuestas ni un producto financiero.
Es un proyecto de ingeniería práctica: automatización de flujos web/API,
validación de datos, orquestación local con `systemd`, snapshots auditables,
tests con fixtures y publicación estática.

## Qué Demuestra

- Automatización end-to-end: discovery asistido, captura prepartido,
  finalización postpartido y deploy estático.
- Diseño defensivo en integraciones inestables: timeouts, retries, validación
  Zod, allowlists, hashes SHA-256 y redacción de tokens.
- Criterio de producción: no DB si JSON versionado alcanza, no serverless si
  `dist/` estático alcanza, no llamadas reales en CI.
- Operación en VPS: timers `systemd --user`, Chromium bajo `xvfb-run`,
  procesos aislados por partido y comandos reproducibles.
- UI de consulta con Astro + React: filtros en cliente, snapshots de Content
  Collections y build 100 % estático.
- Workflow AI-assisted: prompts estructurados generan manifiestos diarios; el
  código valida y ejecuta solo lo que cumple contrato.

Aunque la implementación está en TypeScript, el problema es el mismo que se
resuelve en automatización con Python: navegar sistemas externos, convertir
fuentes poco confiables en datos verificables, programar tareas, registrar
evidencia y dejar un resultado consumible.

## Arquitectura

```text
PROMPTv3.md / investigación asistida
        ↓
data/matches/YYYY-MM-DD.json          manifiesto diario validado
        ↓
scripts/orchestrate-matches.ts        crea timers systemd por partido
        ↓
scripts/find-network-endpoint.ts      detecta single-pre-event.json en Stake
        ↓
scripts/odds-capture.ts               congela cuotas en src/content/matches
        ↓
scripts/match-finalize.ts             cruza ESPN final + reglas de mercados
        ↓
Astro Content Collections             render estático de / y /partidos/[slug]
        ↓
dist/                                 hosting estático
```

Fuente de verdad pública:

```text
src/content/matches/*.json
```

Evidencia cruda no interactiva:

```text
data/evidence/espn/*.json
```

Nunca se debe versionar un `hidenseek` real de Stake. Las URLs internas se
descubren en ejecución y se pasan directo al capturador.

## Stack

- Astro, React, Tailwind, Content Collections.
- TypeScript, Zod, Vitest, Playwright, Axe.
- Node `fetch`, `curl` vía `spawn`, `systemd-run`, `xvfb-run`.
- ESPN public summary JSON para resultados.
- Stake internal `single-pre-event.json` para cuotas prepartido.
- Wrangler para publicar assets estáticos.

## Flujo Operativo

### 1. Crear Manifiesto Diario

El manifiesto diario vive en:

```text
data/matches/YYYY-MM-DD.json
```

Se genera con investigación asistida usando [`PROMPTv3.md`](PROMPTv3.md). El
JSON debe tener `schema_version: "match-discovery-manifest.v2"` y, por partido:

- equipos, kickoff UTC/Lima, fase y sede;
- URL pública de Stake y `public_page_id`;
- URL ESPN y `event_id`;
- `validation.review_required: false`.

Ejemplo mínimo:

```json
{
  "schema_version": "match-discovery-manifest.v2",
  "generated_for": {
    "local_date": "2026-06-21",
    "timezone": "America/Lima"
  },
  "competition": {
    "name": "FIFA World Cup 2026"
  },
  "matches": []
}
```

### 2. Programar Captura y Resultado

En el VPS:

```bash
pnpm exec tsx scripts/orchestrate-matches.ts data/matches/2026-06-21.json
```

El orquestador:

- valida todo el manifiesto antes de crear timers;
- programa captura de Stake 1 hora antes del kickoff;
- programa watcher de ESPN 2 horas después del kickoff;
- consulta ESPN cada 10 minutos hasta detectar final;
- espera 25 minutos después del final para consolidar estadísticas;
- ejecuta `match:finalize --trust-event-id`;
- usa `systemd-run --user --collect` con timers persistentes.

Requisitos del VPS:

- Linux con `systemd --user`;
- `pnpm` disponible o `PNPM_BIN=/ruta/a/pnpm`;
- `xvfb-run` para ejecutar Chromium sin sesión gráfica real;
- browsers de Playwright instalados.

### 3. Captura Manual Prepartido

Si quieres operar un partido manualmente, primero encuentra el endpoint interno:

```bash
pnpm tsx scripts/find-network-endpoint.ts \
  "https://stake.pe/deportes/football/world/fifa-world-cup/equipo-a-vs-equipo-b/event/123" \
  "single-pre-event.json"
```

Luego congela cuotas:

```bash
pnpm odds:capture -- \
  --slug=equipo-a-vs-equipo-b \
  --stake-url="https://stake.pe/deportes/football/world/fifa-world-cup/equipo-a-vs-equipo-b/event/123" \
  --stake-api-url="$STAKE_EVENT_API_URL" \
  --kickoff="2026-06-21T16:00:00.000Z" \
  --title="Equipo A vs Equipo B" \
  --competition="FIFA World Cup 2026"
```

`--stake-api-url` es obligatorio. El sistema no lo construye, no lo corrige, no
lo descubre dentro del capturador y no lo reutiliza. Solo valida HTTPS,
allowlist `.websbkt.com` y que el event ID coincida.

### 4. Validar y Finalizar Manualmente

Validación estricta:

```bash
pnpm espn:validate -- --slug=brasil-vs-marruecos --event-id=760419
```

Cuando ESPN usa nombres en otro idioma y ya verificaste manualmente el ID:

```bash
pnpm espn:validate -- \
  --slug=alemania-vs-curazao \
  --event-id=760422 \
  --trust-event-id
```

Finalización:

```bash
pnpm match:finalize -- \
  --slug=alemania-vs-curazao \
  --event-id=760422 \
  --trust-event-id
```

`--trust-event-id` solo omite la comparación semántica de identidad. No permite
finalizar partidos en vivo, programados, cancelados o sin marcador final.

## Snapshot

Cada partido se guarda como JSON versionado:

```json
{
  "schemaVersion": "2.0",
  "slug": "brasil-vs-marruecos",
  "phase": "finalized",
  "stake": {
    "eventUrl": "https://stake.pe/...",
    "eventId": "21798325"
  },
  "sportsData": {
    "provider": "espn",
    "eventId": "760419",
    "leagueSlug": "fifa.world"
  },
  "odds": {
    "source": "stake",
    "capturedAt": "2026-06-13T21:08:03.608Z",
    "frozen": true,
    "markets": []
  },
  "result": {
    "status": "FINISHED",
    "score": { "home": 1, "away": 1 }
  }
}
```

La finalización preserva cuotas, IDs de mercado, IDs de selección y stake
original. Solo se agregan resultado, evidencia y estado de resolución.

## Mercados Soportados

- Resultado 1X2.
- Doble oportunidad.
- Draw no bet.
- Totales del partido, equipo y primer tiempo.
- Ambos equipos anotan.
- Primer equipo en anotar.
- Marcador exacto.
- Córners totales.
- Tarjetas amarillas.
- Goleador anytime.
- Tiros a puerta de jugador.

Mercados desconocidos o sin evaluación segura se conservan como `UNSUPPORTED`
para inspección, sin inventar una resolución.

## Comandos

```bash
pnpm dev
pnpm build
pnpm deploy
pnpm check
pnpm lint
pnpm format:check
pnpm test
pnpm test:coverage
pnpm test:e2e

pnpm stake:diagnose -- --stake-url=... --stake-api-url=...
pnpm odds:capture -- --slug=... --stake-url=... --stake-api-url=... --kickoff=... --title=...
pnpm espn:validate -- --slug=... --event-id=... [--trust-event-id]
pnpm match:finalize -- --slug=... --event-id=... [--trust-event-id]

pnpm exec tsx scripts/find-network-endpoint.ts <stake-page-url> single-pre-event.json
pnpm exec tsx scripts/orchestrate-matches.ts data/matches/YYYY-MM-DD.json
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
PNPM_BIN=/usr/bin/pnpm
```

`PNPM_BIN` es opcional para uso local, pero recomendable en timers de `systemd`.

## Calidad y Seguridad

- Validación de entrada con Zod y checks manuales en bordes de confianza.
- Tests con fixtures/mocks; CI no debe llamar a Stake ni ESPN.
- Escritura atómica de snapshots.
- Hash SHA-256 de payloads de resultado.
- Allowlist estricta de hosts.
- Censura de `hidenseek` en errores, logs y evidencia.
- Sin DB, sin APIs públicas, sin panel admin y sin server runtime en producción.

## Testing

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test
pnpm test:e2e
pnpm build
```

Self-checks rápidos de scripts:

```bash
pnpm tsx scripts/find-network-endpoint.ts --self-test
pnpm exec tsx scripts/orchestrate-matches.ts --self-test
```

## Despliegue

El sitio se construye como estático:

```bash
pnpm build
```

Publicación con Wrangler:

```bash
pnpm deploy
```

El hosting solo necesita servir `dist/`.

## Decisiones Técnicas

- [0002: Static post-match snapshots](docs/decisions/0002-static-post-match-snapshots.md)
- [0003: Stake live capture browser modes](docs/decisions/0003-stake-live-capture-browser-modes.md)
- [0005: ESPN post-match provider](docs/decisions/0005-espn-summary-post-match-provider.md)
- [0006: Stake API-only odds capture](docs/decisions/0006-stake-api-first-odds-capture.md)
