# Stake Match Tracker

Panel informativo que importa las cuotas prepartido de un evento público de Stake y muestra, durante el partido, qué selecciones ya se cumplieron, cuáles siguen pendientes y cuáles ya perdieron.

> Este proyecto no realiza apuestas, no gestiona dinero, no accede a cuentas de usuarios y no calcula montos apostados. Solo presenta cuotas públicas capturadas antes del inicio y las compara con datos deportivos en vivo.

---

## 1. Objetivo

Construir una aplicación personal, pública y de solo lectura para seguir un partido a la vez —con posibilidad de soportar varios más adelante— y responder visualmente preguntas como:

- ¿Qué pagaba Stake por este resultado antes del partido?
- ¿Qué apuestas ya se cumplieron?
- ¿Cuáles todavía pueden ocurrir?
- ¿Cuáles ya son imposibles o perdieron?
- ¿En qué minuto ocurrió el evento que resolvió una selección?

Ejemplo de salida:

```text
Canadá 2 - 1 Bosnia · 67'

Total de goles
✓ Más de 0.5                 1.05
✓ Más de 1.5                 1.30
✓ Más de 2.5                 1.95
○ Más de 3.5                 3.20
✕ Menos de 2.5               1.80

Ambos equipos marcan
✓ Sí                         2.10
✕ No                         1.67
```

---

## 2. Principios del producto

1. Los visitantes no pegan URLs ni configuran partidos.
2. El administrador importa previamente una URL pública de Stake.
3. Las cuotas se capturan antes del inicio y luego quedan congeladas.
4. Durante el encuentro solo se actualizan los datos deportivos y el estado de las selecciones.
5. Todos los visitantes ven el mismo estado compartido.
6. Los colores nunca son la única señal: cada estado debe incluir icono y texto accesible.
7. No se debe intentar evadir CAPTCHA, autenticación, bloqueos geográficos, rate limits ni protecciones del sitio origen.
8. Si un mercado no puede evaluarse con certeza, debe mostrarse como `unsupported`, nunca adivinarse.

---

## 3. Alcance del MVP

### Incluido

- Aplicación en Astro desplegada en Vercel.
- Página pública del partido.
- Panel privado o comando CLI para importar una URL de Stake.
- Captura de las cuotas prepartido.
- Congelación de la última captura entre 2 y 5 minutos antes del inicio; valor por defecto: 3 minutos.
- Integración con API-Football.
- Polling del navegador cada 10 segundos.
- Refresco del marcador y eventos cada 15 segundos.
- Refresco de estadísticas colectivas y de jugadores cada 60 segundos.
- Caché compartida y bloqueo distribuido para evitar llamadas duplicadas.
- Persistencia en PostgreSQL.
- Motor de reglas independiente del proveedor y de la UI.
- Tests unitarios, de integración y end-to-end.
- Vista responsive y accesible.
- Historial mínimo de actualizaciones y errores.

### Fuera del MVP

- Apuestas en vivo o cambios de cuota después del inicio.
- Registro de usuarios públicos.
- Montos apostados por personas.
- Colocación automática de apuestas.
- Acceso autenticado a Stake.
- Cashout, Bet Builder, boosts o promociones.
- Early Payout y reglas comerciales particulares de Stake.
- Notificaciones push.
- Aplicación móvil nativa.
- Soporte completo para todos los deportes.

---

## 4. Stack obligatorio

Usar versiones estables compatibles entre sí.

- **Frontend y endpoints:** Astro + TypeScript.
- **Componentes interactivos:** React islands.
- **Despliegue web:** Vercel mediante `@astrojs/vercel`.
- **Estilos:** Tailwind CSS.
- **Validación:** Zod.
- **Base de datos:** Supabase PostgreSQL.
- **ORM y migraciones:** Drizzle ORM.
- **Caché y locks:** Upstash Redis.
- **Proveedor deportivo:** API-Football v3.
- **Importador web:** Playwright.
- **Tests unitarios/integración:** Vitest.
- **Tests E2E:** Playwright Test.
- **Gestor de paquetes:** pnpm.
- **Lint/format:** ESLint + Prettier.
- **CI:** GitHub Actions.

No introducir Next.js, NestJS ni otro framework de backend salvo que exista un bloqueo técnico documentado.

---

## 5. Arquitectura

```text
┌──────────────────────────────────────────────────────┐
│ Astro en Vercel                                      │
│                                                      │
│  /                          Página pública principal │
│  /partidos/[slug]           Página pública opcional  │
│  /admin                     Configuración privada    │
│  /api/admin/...             Importación y mapping    │
│  /api/matches/[slug]/state  Estado compartido        │
└───────────────────────┬──────────────────────────────┘
                        │
                 ┌──────┴──────┐
                 │             │
                 ▼             ▼
        Supabase PostgreSQL  Upstash Redis
        datos persistentes   caché + locks
                 ▲             ▲
                 └──────┬──────┘
                        │
              refreshMatchIfStale()
                        │
                        ▼
                 API-Football v3
```

### Importación de Stake

```text
URL pública de Stake
        │
        ▼
StakeImporter
        │
        ├─ estrategia 1: inspeccionar respuestas JSON/XHR
        └─ estrategia 2: expandir mercados y parsear DOM
        │
        ▼
normalización
        │
        ▼
snapshot inmutable de cuotas
```

El importador debe estar aislado detrás de una interfaz:

```ts
export interface OddsImporter {
  importEvent(input: { url: string; capturedAt: Date }): Promise<ImportedEvent>;
}
```

La implementación no debe acoplar el resto del sistema a selectores CSS de Stake.

---

## 6. Estrategia de importación

### Orden de preferencia

#### Estrategia A: respuestas de red

Con Playwright:

1. Abrir la URL.
2. Escuchar respuestas XHR/fetch.
3. Identificar la respuesta que contiene mercados y selecciones.
4. Validar el payload con Zod.
5. Transformarlo al modelo normalizado.
6. Guardar la respuesta original sanitizada como fixture de depuración.

Playwright permite observar las solicitudes y respuestas de red de la página. Priorizar esta estrategia porque es menos frágil que depender de clases CSS.

#### Estrategia B: DOM renderizado

Si no es posible obtener un payload estructurado:

1. Esperar a que aparezcan los bloques `.wol-market`.
2. Expandir todos los mercados colapsados.
3. Pulsar cada control “Ver más”.
4. Esperar a que dejen de cambiar los nodos relevantes.
5. Extraer:
   - nombre del mercado;
   - `data-market-id`;
   - nombre de la selección;
   - `data-event-odd-id`;
   - `data-odd-id`;
   - `data-odd-value`;
   - `data-additional-value`;
   - `data-odd-team_side`;
   - `data-odd-ttl`;
   - estado bloqueado, cuando exista.
6. Guardar una copia del HTML para reproducir errores.
7. Normalizar nombres y valores.

### Reglas del importador

- Aceptar solo URLs HTTPS de dominios permitidos configurables.
- Validar que la URL corresponda a un evento deportivo.
- No usar cookies privadas.
- No iniciar sesión.
- No resolver ni eludir CAPTCHA.
- Implementar timeout y mensaje de error legible.
- El import debe ser idempotente.
- Una reimportación anterior al inicio puede crear un nuevo snapshot.
- Una vez congeladas las cuotas, una reimportación no debe sobrescribirlas sin una acción administrativa explícita.
- Mantener `raw_market_name` y `raw_selection_name` para auditoría.
- No descartar silenciosamente mercados desconocidos: guardarlos como `UNSUPPORTED`.

### Ejemplos esperados del fixture inicial

El fixture HTML de referencia contiene, entre otros:

- Resultado: Estados Unidos `2.10`, empate `3.15`, Paraguay `3.75`.
- Ambos marcan: sí `2.10`, no `1.67`.
- Total de goles: más de `2.5` a `2.45`, menos de `2.5` a `1.55`.
- Doble oportunidad.
- Ganador sin empate.
- Hándicap.
- Encabezados de marcador exacto, primer gol, goleadores, tarjetas, córners y tiros a puerta.

Copiar ese HTML a:

```text
tests/fixtures/stake/event-21798323-main-markets.html
```

y utilizarlo en tests sin realizar llamadas reales a Stake.

---

## 7. Captura y congelación de cuotas

### Estados del snapshot

```ts
type OddsSnapshotStatus =
  | "draft"
  | "active"
  | "frozen"
  | "superseded"
  | "failed";
```

### Comportamiento

- Antes del inicio se pueden generar varios snapshots.
- El snapshot visible es el último snapshot válido.
- La cuota oficial del tablero es la última capturada antes de:
  - `kickoff_at - ODDS_FREEZE_OFFSET_MINUTES`.
- Valor por defecto: `3`.
- Mostrar siempre:
  - fecha y hora de captura;
  - zona horaria;
  - origen;
  - aviso de que es una captura histórica y puede diferir de la cuota actual.
- No cambiar cuotas después del congelamiento.
- Si no se pudo capturar antes del corte, permitir congelamiento manual con advertencia visible.

---

## 8. Mapping con API-Football

No asumir que los nombres de Stake coinciden exactamente con los del proveedor.

### Flujo

1. Tras importar Stake, extraer:
   - equipo local;
   - equipo visitante;
   - fecha estimada;
   - competición.
2. Consultar fixtures candidatos en API-Football.
3. Calcular una puntuación por:
   - similitud del local;
   - similitud del visitante;
   - proximidad horaria;
   - competición.
4. Mostrar candidatos en `/admin`.
5. Exigir selección o confirmación explícita del fixture.
6. Guardar `api_football_fixture_id`.

No comenzar el seguimiento en vivo sin mapping confirmado.

### Datos requeridos

- Fixture y estado.
- Marcador.
- Eventos:
  - goles;
  - tarjetas;
  - sustituciones cuando sean necesarias.
- Estadísticas del partido:
  - córners;
  - tiros a puerta.
- Estadísticas de jugadores:
  - tiros a puerta;
  - goles;
  - minutos o participación.

El adaptador del proveedor debe exponer un modelo propio:

```ts
export interface LiveSportsProvider {
  getFixture(fixtureId: number): Promise<ProviderFixture>;
  getEvents(fixtureId: number): Promise<ProviderEvent[]>;
  getTeamStatistics(fixtureId: number): Promise<ProviderTeamStats>;
  getPlayerStatistics(fixtureId: number): Promise<ProviderPlayerStats[]>;
}
```

El motor de reglas no debe recibir directamente el JSON de API-Football.

---

## 9. Mercados soportados en el MVP

Usar enums estables; no usar el texto visible como lógica.

```ts
export enum MarketType {
  MATCH_RESULT = "MATCH_RESULT",
  DOUBLE_CHANCE = "DOUBLE_CHANCE",
  DRAW_NO_BET = "DRAW_NO_BET",
  HANDICAP = "HANDICAP",
  TOTAL_GOALS = "TOTAL_GOALS",
  TEAM_TOTAL_GOALS = "TEAM_TOTAL_GOALS",
  BOTH_TEAMS_TO_SCORE = "BOTH_TEAMS_TO_SCORE",
  EXACT_SCORE = "EXACT_SCORE",
  FIRST_TEAM_TO_SCORE = "FIRST_TEAM_TO_SCORE",
  ANYTIME_GOALSCORER = "ANYTIME_GOALSCORER",
  FIRST_HALF_TOTAL_GOALS = "FIRST_HALF_TOTAL_GOALS",
  TOTAL_YELLOW_CARDS = "TOTAL_YELLOW_CARDS",
  TOTAL_CORNERS = "TOTAL_CORNERS",
  PLAYER_SHOTS_ON_TARGET = "PLAYER_SHOTS_ON_TARGET",
  UNSUPPORTED = "UNSUPPORTED",
}
```

### Prioridad de implementación

#### P0

- Resultado.
- Doble oportunidad.
- Ganador sin empate.
- Total de goles.
- Ambos equipos marcan.
- Equipo que marca primero.
- Total de tarjetas amarillas.
- Total de córners.

#### P1

- Total de goles por equipo.
- Hándicap.
- Marcador exacto.
- Primer tiempo: total de goles.
- Jugador que marca.
- Tiros a puerta por jugador.

#### No soportados

- Early Payout.
- Early Payout por ventaja.
- Cashout.
- Bet Builder.
- Promociones o boosts.
- Mercados con reglas comerciales no deducibles del partido.

---

## 10. Modelo normalizado de selección

```ts
type SelectionStatus = "pending" | "won" | "lost" | "void" | "unsupported";

type SelectionOperator =
  | "HOME"
  | "DRAW"
  | "AWAY"
  | "HOME_OR_DRAW"
  | "HOME_OR_AWAY"
  | "DRAW_OR_AWAY"
  | "OVER"
  | "UNDER"
  | "YES"
  | "NO"
  | "EXACT"
  | "PLAYER"
  | "TEAM";

interface NormalizedSelection {
  id: string;
  matchId: string;
  marketType: MarketType;
  operator: SelectionOperator;
  participantType: "MATCH" | "HOME_TEAM" | "AWAY_TEAM" | "PLAYER";
  participantId?: string;
  participantName?: string;
  line?: number;
  exactHomeScore?: number;
  exactAwayScore?: number;
  oddDecimal: number;
  status: SelectionStatus;
  resolvedAt?: string;
  resolvedMinute?: number;
  resolutionReason?: string;
  sourceMarketId?: string;
  sourceSelectionId?: string;
  rawMarketName: string;
  rawSelectionName: string;
}
```

---

## 11. Semántica de estados

### `pending`

La selección todavía puede ganar y todavía puede perder.

Ejemplos:

- “Más de 3.5 goles” con marcador 2-1.
- “Canadá gana” durante el segundo tiempo.
- “Menos de 4.5 tarjetas” antes del final y con 2 tarjetas.

### `won`

La selección ya se cumplió de forma irreversible o terminó cumpliéndose.

Ejemplos:

- “Más de 2.5 goles” al producirse el tercer gol.
- “Ambos marcan: sí” cuando ambos equipos ya marcaron.
- “Más de 8.5 córners” con el noveno córner.
- “Jugador más de 1.5 tiros a puerta” con el segundo tiro a puerta.
- “Resultado local” únicamente al terminar el partido.

### `lost`

La selección ya no puede ganar o terminó sin cumplirse.

Ejemplos:

- “Menos de 2.5 goles” al producirse el tercer gol.
- Marcador exacto `1-0` cuando el partido ya está `2-0`.
- “Ambos marcan: no” cuando ambos ya marcaron.
- “Resultado local” al terminar con empate o victoria visitante.

### `void`

La regla del mercado implica devolución o anulación.

Ejemplos:

- Draw no bet cuando el partido termina empatado.
- Línea asiática entera que termina exactamente en la línea, cuando corresponda.
- Mercado de jugador cuando el proveedor y la regla confirmen que la selección debe anularse.

No asumir reglas de anulación de jugadores sin confirmarlas y codificarlas explícitamente.

### `unsupported`

No existe regla implementada o faltan datos confiables.

Debe mostrarse con una explicación como “Este mercado todavía no puede evaluarse automáticamente”.

---

## 12. Motor de reglas

Crear un motor puro, determinista y sin acceso a red ni base de datos.

```ts
export interface RuleEvaluationContext {
  now: Date;
  fixtureStatus: FixtureStatus;
  elapsedMinutes?: number;
  score: {
    home: number;
    away: number;
    halftimeHome?: number;
    halftimeAway?: number;
  };
  firstScoringTeam?: "HOME" | "AWAY" | null;
  yellowCards: {
    home: number;
    away: number;
  };
  corners: {
    home: number;
    away: number;
  };
  playerStats: Record<
    string,
    {
      goals: number;
      shotsOnTarget: number;
      appeared: boolean;
    }
  >;
}

export interface RuleEvaluation {
  status: SelectionStatus;
  resolvedAt?: Date;
  resolvedMinute?: number;
  reason: string;
}
```

API sugerida:

```ts
evaluateSelection(
  selection: NormalizedSelection,
  context: RuleEvaluationContext,
): RuleEvaluation;
```

### Requisitos

- Una función o estrategia separada por `MarketType`.
- Tests de tabla para cada mercado.
- Una selección resuelta no debe volver a `pending`.
- Los eventos corregidos por VAR sí pueden exigir recalcular el estado desde el historial completo.
- Para soportar correcciones, no mutar incrementalmente como única fuente de verdad: reconstruir el contexto desde el último snapshot del proveedor y sus eventos vigentes.
- Registrar `reason`, `resolvedAt` y `resolvedMinute`.
- El motor debe ser idempotente.

---

## 13. Actualización en vivo

### Intervalos

```text
Cliente → endpoint compartido:       10 s
Fixture, marcador y eventos:         15 s
Estadísticas colectivas:             60 s
Estadísticas de jugadores:           60 s
Partido finalizado:                   sin polling continuo
```

API-Football publica una frecuencia aproximada de 15 segundos para fixtures y eventos del Mundial 2026. Consultar más rápido no garantiza datos más frescos.

### Flujo request-driven

Cada cliente consulta:

```http
GET /api/matches/:slug/state
```

El endpoint:

1. Lee el último estado de PostgreSQL o Redis.
2. Determina qué secciones están vencidas.
3. Intenta adquirir un lock Redis por fixture.
4. Solo el proceso que obtiene el lock llama al proveedor.
5. Guarda los datos actualizados.
6. Ejecuta el motor de reglas.
7. Persiste los cambios.
8. Libera el lock.
9. Devuelve el estado actual.
10. Los procesos que no consiguen el lock devuelven la caché existente.

Claves sugeridas:

```text
match:{matchId}:state
match:{matchId}:refresh-lock
match:{matchId}:fixture:last-refresh
match:{matchId}:stats:last-refresh
match:{matchId}:players:last-refresh
```

### Lock

- TTL sugerido: 12 segundos para fixture/eventos.
- No bloquear la respuesta del usuario esperando indefinidamente.
- Si existe caché, devolverla con `stale: true`.
- Implementar protección contra stampede.
- El endpoint debe incluir `lastUpdatedAt`, `stale` y `nextSuggestedPollMs`.

### Vercel Cron

No usar Vercel Cron para el bucle de 10–15 segundos. Su formato cron trabaja con campos de minuto y no es apropiado para refrescos subminuto.

Se puede usar un cron de baja frecuencia para:

- detectar partidos próximos;
- verificar partidos abandonados;
- realizar limpieza;
- cerrar estados que quedaron inconclusos.

---

## 14. Modelo de datos

### `matches`

```text
id uuid pk
slug text unique
title text
home_team_name text
away_team_name text
competition_name text nullable
kickoff_at timestamptz
timezone text
status text
stake_url text
stake_event_id text nullable
api_football_fixture_id bigint nullable unique
odds_freeze_offset_minutes int default 3
published boolean default false
created_at timestamptz
updated_at timestamptz
```

### `odds_snapshots`

```text
id uuid pk
match_id uuid fk
status text
captured_at timestamptz
frozen_at timestamptz nullable
source text
source_payload jsonb nullable
import_version text
error_message text nullable
created_at timestamptz
```

### `markets`

```text
id uuid pk
snapshot_id uuid fk
match_id uuid fk
market_type text
raw_market_name text
source_market_id text nullable
display_order int
supported boolean
metadata jsonb
```

### `selections`

```text
id uuid pk
market_id uuid fk
match_id uuid fk
operator text
participant_type text
participant_id text nullable
participant_name text nullable
line numeric nullable
exact_home_score int nullable
exact_away_score int nullable
odd_decimal numeric
raw_selection_name text
source_selection_id text nullable
status text
resolved_at timestamptz nullable
resolved_minute int nullable
resolution_reason text nullable
metadata jsonb
created_at timestamptz
updated_at timestamptz
```

### `live_snapshots`

```text
id uuid pk
match_id uuid fk
provider text
fixture_status text
elapsed_minutes int nullable
score_home int
score_away int
payload jsonb
captured_at timestamptz
```

### `match_events`

```text
id uuid pk
match_id uuid fk
provider_event_id text
event_type text
team_side text nullable
player_provider_id text nullable
player_name text nullable
minute int nullable
extra_minute int nullable
is_cancelled boolean default false
payload jsonb
occurred_at timestamptz nullable
unique(match_id, provider_event_id)
```

### `provider_mappings`

```text
id uuid pk
match_id uuid fk
provider text
provider_fixture_id text
home_team_provider_id text nullable
away_team_provider_id text nullable
confirmed_at timestamptz
confirmed_by text
metadata jsonb
```

Crear índices para:

- `matches.slug`;
- `matches.api_football_fixture_id`;
- `selections.match_id`;
- `selections.status`;
- `match_events(match_id, event_type)`;
- `live_snapshots(match_id, captured_at desc)`.

---

## 15. Endpoints

### Públicos

#### `GET /api/matches/:slug/state`

Devuelve:

```json
{
  "match": {
    "slug": "canada-vs-bosnia",
    "status": "LIVE",
    "elapsedMinutes": 67,
    "score": { "home": 2, "away": 1 },
    "kickoffAt": "2026-06-20T21:00:00Z"
  },
  "odds": {
    "capturedAt": "2026-06-20T20:57:00Z",
    "frozen": true
  },
  "markets": [],
  "lastUpdatedAt": "2026-06-20T22:24:15Z",
  "stale": false,
  "nextSuggestedPollMs": 10000
}
```

Requisitos:

- Respuesta validada con Zod.
- Cache headers apropiados sin permitir que una CDN sirva datos excesivamente viejos.
- Nunca exponer tokens, payloads internos completos ni errores del proveedor.

#### `GET /api/matches/current`

Devuelve el partido publicado como principal.

### Administrativos

Proteger todas estas rutas.

#### `POST /api/admin/matches`

Crea un partido.

#### `POST /api/admin/matches/:id/import-stake`

Importa o reimporta cuotas antes del congelamiento.

#### `GET /api/admin/matches/:id/fixture-candidates`

Busca fixtures candidatos.

#### `POST /api/admin/matches/:id/confirm-fixture`

Confirma el mapping.

#### `POST /api/admin/matches/:id/freeze-odds`

Congela cuotas manualmente.

#### `POST /api/admin/matches/:id/publish`

Publica el partido.

#### `POST /api/admin/matches/:id/refresh`

Fuerza un refresh deportivo con rate limit.

### CLI obligatorio

Aunque exista panel administrativo, implementar también:

```bash
pnpm stake:import --url="https://..." --slug="canada-vs-bosnia"
```

El CLI debe usar exactamente los mismos servicios de dominio que el endpoint.

Esto permite importar localmente si Playwright no funciona de forma fiable dentro de Vercel.

---

## 16. Rutas de UI

### `/`

- Redirige al partido principal o muestra directamente el partido publicado.
- Estado vacío legible cuando no existe partido activo.

### `/partidos/[slug]`

- Encabezado con equipos, marcador, reloj y estado.
- Hora de actualización.
- Cuotas capturadas y fecha.
- Filtros:
  - Todas;
  - Resultado;
  - Goles;
  - Tarjetas;
  - Córners;
  - Jugadores.
- Filtro por estado:
  - Pendientes;
  - Acertadas;
  - Perdidas;
  - Anuladas.
- Buscador de selección.
- Mercados plegables.
- Orden estable basado en Stake y prioridad de producto.

### `/admin`

- Autenticación sencilla y segura.
- Crear/editar partido.
- Pegar URL de Stake.
- Ver resultado de la importación.
- Ver mercados soportados/no soportados.
- Elegir fixture de API-Football.
- Congelar cuotas.
- Publicar/despublicar.
- Forzar refresco.
- Ver últimos errores.

---

## 17. Diseño visual

### Estados

```text
pending      gris      ○ Pendiente
won          verde     ✓ Acertada
lost         rojo      ✕ Perdida
void         amarillo  ↺ Anulada
unsupported  neutro    ? Sin evaluación
```

Requisitos:

- No depender exclusivamente del color.
- Contraste WCAG AA.
- `aria-live="polite"` para marcador y actualizaciones relevantes.
- Respetar `prefers-reduced-motion`.
- No animar toda la lista en cada polling.
- Mostrar una transición breve solo cuando una selección cambia de estado.
- Mobile-first.
- Cuota visible y alineada.
- Minuto de resolución cuando exista.
- Tooltip o texto expandible con el motivo.

Ejemplo:

```text
✓ Más de 2.5 goles        2.45
  Acertada en el minuto 61: tercer gol del partido.
```

---

## 18. Manejo de errores

### Stake

- `STAKE_INVALID_URL`
- `STAKE_EVENT_NOT_FOUND`
- `STAKE_PAGE_TIMEOUT`
- `STAKE_BLOCKED_OR_CHALLENGED`
- `STAKE_NO_MARKETS_FOUND`
- `STAKE_SCHEMA_CHANGED`
- `STAKE_IMPORT_ALREADY_FROZEN`

### API-Football

- `SPORTS_PROVIDER_UNAUTHORIZED`
- `SPORTS_PROVIDER_RATE_LIMITED`
- `SPORTS_FIXTURE_NOT_FOUND`
- `SPORTS_PROVIDER_TIMEOUT`
- `SPORTS_PROVIDER_INVALID_RESPONSE`

### Aplicación

- `MATCH_NOT_FOUND`
- `MATCH_NOT_PUBLISHED`
- `FIXTURE_MAPPING_REQUIRED`
- `LOCK_NOT_ACQUIRED`
- `STALE_DATA_RETURNED`

Errores públicos deben ser genéricos. Registrar el detalle solo en servidor.

---

## 19. Seguridad

- Variables secretas solo en servidor.
- Nunca prefijar secretos con `PUBLIC_`.
- Proteger `/admin` y `/api/admin/*`.
- Usar cookies `HttpOnly`, `Secure` y `SameSite=Lax` si se implementa sesión.
- Validar CSRF en operaciones administrativas.
- Validar y normalizar URLs.
- Permitir una allowlist de hosts de Stake.
- Aplicar rate limiting a endpoints administrativos y refresh forzado.
- Sanitizar cualquier texto importado antes de renderizar.
- No renderizar HTML recibido desde Stake.
- No almacenar cookies ni tokens de navegación.
- No exponer el payload completo de API-Football al cliente.
- Añadir una nota visible: “Sitio informativo no afiliado a Stake”.
- Revisar términos de uso y normativa aplicable antes de publicar comercialmente.

---

## 20. Variables de entorno

Crear `.env.example` sin secretos reales:

```dotenv
DATABASE_URL=
DIRECT_URL=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_KEY=

ADMIN_SESSION_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=

PUBLIC_SITE_URL=http://localhost:4321
ODDS_FREEZE_OFFSET_MINUTES=3
PUBLIC_STATE_POLL_INTERVAL_MS=10000
EVENTS_REFRESH_INTERVAL_MS=15000
STATS_REFRESH_INTERVAL_MS=60000
PLAYER_STATS_REFRESH_INTERVAL_MS=60000

STAKE_ALLOWED_HOSTS=stake.pe
STAKE_IMPORT_TIMEOUT_MS=45000

# Opcional para un navegador remoto.
BROWSER_WS_ENDPOINT=
```

---

## 21. Estructura sugerida

```text
.
├── src/
│   ├── components/
│   │   ├── match/
│   │   ├── markets/
│   │   └── admin/
│   ├── islands/
│   │   └── LiveMatchBoard.tsx
│   ├── layouts/
│   ├── pages/
│   │   ├── index.astro
│   │   ├── partidos/[slug].astro
│   │   ├── admin/
│   │   └── api/
│   ├── server/
│   │   ├── auth/
│   │   ├── cache/
│   │   ├── db/
│   │   ├── importers/
│   │   │   └── stake/
│   │   ├── providers/
│   │   │   └── api-football/
│   │   ├── repositories/
│   │   ├── services/
│   │   └── observability/
│   ├── domain/
│   │   ├── markets/
│   │   ├── rules/
│   │   ├── match/
│   │   └── types/
│   └── styles/
├── drizzle/
├── scripts/
│   └── import-stake.ts
├── tests/
│   ├── fixtures/
│   │   ├── stake/
│   │   └── api-football/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── public/
├── astro.config.ts
├── playwright.config.ts
├── vitest.config.ts
├── drizzle.config.ts
├── vercel.json
└── .github/workflows/ci.yml
```

---

## 22. Tests obligatorios

No se considera terminado ningún mercado sin tests.

### 22.1 Unitarios: parser de Stake

Usar fixtures locales.

Casos mínimos:

- Extrae nombre e ID del mercado.
- Extrae nombre, ID y cuota decimal de cada selección.
- Extrae `data-additional-value`.
- Interpreta `_OVR` y `_UND`.
- Interpreta local, empate y visitante.
- Omite nodos bloqueados sin identificador o los marca explícitamente.
- Expande/combina filas del mismo mercado.
- Conserva campos raw.
- Detecta HTML sin mercados.
- Detecta cambios de esquema.
- No duplica selecciones.
- Parseo determinista.
- Valida el ejemplo:
  - Estados Unidos `2.10`;
  - empate `3.15`;
  - Paraguay `3.75`;
  - más de `2.5` a `2.45`;
  - menos de `2.5` a `1.55`.

### 22.2 Unitarios: normalización

Casos mínimos:

- Resultado.
- Doble oportunidad.
- Ganador sin empate.
- Total over/under.
- Ambos marcan.
- Hándicap positivo y negativo.
- Primer gol.
- Tarjetas.
- Córners.
- Jugador goleador.
- Tiros a puerta.
- Mercado desconocido → `UNSUPPORTED`.
- Acentos, mayúsculas y espacios no cambian el resultado.
- Nombres de equipos no deben confundirse por coincidencias parciales.

### 22.3 Unitarios: motor de reglas

Usar tests de tabla.

#### Resultado

- Pendiente durante el partido.
- Local gana al final.
- Empate al final.
- Visitante gana al final.
- Partido pospuesto o abandonado no se liquida como final.

#### Totales

- Over 2.5 pendiente con 2 goles.
- Over 2.5 ganado con 3.
- Under 2.5 perdido con 3.
- Under 2.5 pendiente con 2 antes del final.
- Under 2.5 ganado al final con 2.
- Línea entera y push, cuando aplique.

#### Ambos marcan

- Sí pendiente con 1-0.
- Sí ganado con 1-1.
- No perdido con 1-1.
- No ganado al final con 2-0.

#### Primer gol

- Sin goles: pendiente.
- Local marca primero: local ganado, visitante perdido.
- Visitante marca primero.
- 0-0 final: manejar la selección “ninguno” solo si fue importada.
- Gol anulado por VAR: recalcular.

#### Marcador exacto

- 1-0 pendiente con 1-0 antes del final.
- 1-0 perdido si pasa a 2-0.
- 1-0 ganado al final.
- 0-0 perdido cuando existe un gol.

#### Tarjetas

- Over 4.5 pendiente con 4.
- Over 4.5 ganado con 5.
- Under 4.5 perdido con 5.
- Definir y testear si segunda amarilla cuenta como una o dos según la estadística elegida.
- Eventos duplicados no aumentan el total.

#### Córners

- Mismos casos de over/under.
- Corrección del proveedor no deja estados corruptos.

#### Jugadores

- Goleador ganado al marcar.
- Goleador pendiente si participa y no marcó.
- Goleador perdido al final.
- Jugador ausente: `void` o `unsupported` según regla configurada.
- Tiros a puerta over 1.5 ganado con 2.
- Estadística no disponible: no marcar como perdida.

#### Invariantes

- `won` o `lost` no vuelven a `pending` salvo reconstrucción explícita por corrección oficial.
- Evaluar dos veces produce el mismo resultado.
- El orden de los eventos equivalentes no cambia el resultado final.
- Nunca se resuelve un mercado con datos `undefined` inventados.

### 22.4 Integración

- Repositorios contra una base de datos de test.
- Migraciones aplican desde cero.
- Importar dos veces no duplica mercados.
- Congelar cuotas evita sobrescritura.
- Mapping de fixture requerido antes de publicar.
- `refreshMatchIfStale()`:
  - consulta cuando la caché venció;
  - no consulta cuando está fresca;
  - actualiza solo estadísticas vencidas;
  - persiste snapshot y estados.
- Respuestas inválidas de API-Football no corrompen el último estado válido.
- Rate limit devuelve caché stale.
- 20 solicitudes concurrentes provocan como máximo una llamada por tipo de refresh.
- Lock expirado se recupera.
- Partido finalizado deja de hacer polling al proveedor.

### 22.5 Contract tests

Guardar JSON reales anonimizados o fixtures construidos desde la documentación:

```text
tests/fixtures/api-football/
  fixture-not-started.json
  fixture-live.json
  fixture-halftime.json
  fixture-finished.json
  events-goals-cards.json
  statistics-corners-shots.json
  players-shots-on-target.json
  error-rate-limit.json
```

Validar todos con Zod.

No realizar llamadas reales al proveedor en CI.

### 22.6 E2E

Con Playwright:

- Admin inicia sesión.
- Crea partido.
- Importa fixture Stake mockeado.
- Confirma fixture deportivo.
- Congela cuotas.
- Publica.
- Visitante ve la página.
- Polling actualiza el marcador.
- Una selección pasa de gris a verde.
- Otra pasa de gris a rojo.
- El cambio incluye texto e icono, no solo color.
- Filtros funcionan.
- Vista móvil no desborda.
- Datos stale muestran aviso discreto.
- Error temporal conserva último estado.
- Partido finalizado deja la vista estable.

Mockear red con `page.route()` o HAR.

### 22.7 Accesibilidad

- Ejecutar axe en la vista principal.
- Sin errores críticos.
- Navegación por teclado.
- Foco visible.
- Encabezados jerárquicos.
- Texto alternativo en escudos.
- Estados anunciables por lectores de pantalla.
- Contraste AA.

### 22.8 Cobertura

Objetivos mínimos:

```text
Motor de reglas:       95% líneas y branches
Parser/normalizador:   90% líneas y branches
Servicios:             85% líneas
Proyecto global:       80% líneas
```

No perseguir cobertura con tests triviales. Priorizar reglas y casos límite.

---

## 23. Scripts

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview",
    "check": "astro check",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx scripts/seed.ts",
    "stake:import": "tsx scripts/import-stake.ts"
  }
}
```

El agente puede adaptar detalles del comando sin eliminar capacidades.

---

## 24. Desarrollo local

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Para Playwright:

```bash
pnpm exec playwright install chromium
```

Para importar:

```bash
pnpm stake:import \
  --url="https://stake.pe/deportes/..." \
  --slug="estados-unidos-vs-paraguay"
```

Debe existir un modo demo sin APIs:

```bash
DEMO_MODE=true pnpm dev
```

El modo demo utilizará fixtures y simulará el avance del partido.

---

## 25. Despliegue

### Vercel

- Añadir adaptador oficial de Astro para Vercel.
- Usar renderizado bajo demanda para rutas dinámicas y endpoints.
- Configurar variables de entorno.
- Conectar Supabase y Upstash.
- Ejecutar migraciones en un paso controlado, no automáticamente en cada request.
- No incluir Chromium completo en la función principal.

### Importador Playwright

Implementar estas opciones en este orden:

1. **CLI local**, obligatorio y suficiente para el MVP.
2. **Navegador remoto** mediante `BROWSER_WS_ENDPOINT`, opcional.
3. **Worker separado**, opcional si se necesita automatización estable.

El frontend y las APIs públicas deben permanecer en Vercel aunque el navegador se ejecute externamente.

---

## 26. Observabilidad

Registrar JSON estructurado con:

```text
requestId
matchId
fixtureId
operation
provider
durationMs
cacheHit
stale
lockAcquired
selectionChanges
errorCode
```

Métricas mínimas:

- llamadas al proveedor por partido;
- ratio de cache hit;
- fallos de importación;
- duración de refresh;
- cantidad de selecciones por estado;
- edad del último dato;
- errores de parsing.

No registrar secretos, cookies ni respuestas completas sensibles.

---

## 27. CI

GitHub Actions debe ejecutar en cada pull request:

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm check
pnpm test:coverage
pnpm build
pnpm test:e2e
```

Requisitos:

- Servicios de test reproducibles.
- Ningún test depende de Stake o API-Football reales.
- Subir reporte de cobertura y traces de Playwright al fallar.
- Bloquear merge si falla cualquier paso.
- Renovate o Dependabot opcional.

---

## 28. Criterios de aceptación

El MVP está terminado cuando:

- [ ] Se puede importar el HTML fixture de Stake.
- [ ] Se extraen correctamente mercados, selecciones y cuotas.
- [ ] Se puede crear y publicar un partido.
- [ ] Las cuotas quedan congeladas y muestran su hora de captura.
- [ ] El partido se vincula a un fixture de API-Football.
- [ ] La página pública carga sin autenticación.
- [ ] El cliente actualiza cada 10 segundos.
- [ ] El servidor evita llamadas duplicadas mediante Redis.
- [ ] Resultado, goles, ambos marcan, primer gol, tarjetas y córners funcionan.
- [ ] Al menos un mercado de jugador funciona si el proveedor entrega estadísticas.
- [ ] Verde, rojo, gris, amarillo y unsupported tienen texto e icono.
- [ ] Las selecciones muestran motivo y minuto de resolución cuando existe.
- [ ] Los datos stale se identifican.
- [ ] El sistema conserva el último estado válido ante un error.
- [ ] Los tests obligatorios pasan.
- [ ] Se cumplen los umbrales de cobertura.
- [ ] La aplicación compila y se despliega en Vercel.
- [ ] No hay secretos en el repositorio.
- [ ] Existe `.env.example`.
- [ ] Existe modo demo reproducible.
- [ ] README y decisiones técnicas quedan actualizados.

---

## 29. Orden de implementación para el agente

### Fase 1 — Base

1. Crear proyecto Astro TypeScript.
2. Configurar Vercel, React, Tailwind, Vitest y Playwright.
3. Configurar Drizzle, Supabase y migraciones.
4. Crear dominio y enums.
5. Añadir `.env.example`.
6. Configurar CI.

### Fase 2 — Importación

1. Copiar fixture HTML.
2. Implementar parser DOM puro.
3. Implementar normalizador.
4. Añadir tests.
5. Implementar CLI.
6. Implementar snapshot y congelamiento.
7. Añadir inspección de red Playwright como estrategia preferida.

### Fase 3 — Datos deportivos

1. Crear adaptador API-Football.
2. Añadir schemas Zod.
3. Implementar búsqueda y confirmación de fixture.
4. Implementar caché y locks.
5. Implementar `refreshMatchIfStale`.
6. Añadir contract e integration tests.

### Fase 4 — Reglas

1. P0 completo.
2. Tests de tabla.
3. Persistencia de cambios.
4. Soporte de correcciones/VAR.
5. P1 según cobertura real del proveedor.

### Fase 5 — UI

1. Página pública.
2. React island con polling.
3. Filtros.
4. Estados accesibles.
5. Página admin.
6. Responsive y accesibilidad.

### Fase 6 — Endurecimiento

1. E2E.
2. Rate limits.
3. Manejo de errores.
4. Logs.
5. Modo demo.
6. Deploy y smoke test.

---

## 30. Instrucciones finales para el agente

- Implementar de extremo a extremo; no dejar pseudocódigo como solución final.
- Mantener TypeScript en modo estricto.
- No usar `any` salvo integración documentada y encapsulada.
- Validar toda entrada externa con Zod.
- Mantener el dominio independiente de Astro, Playwright y API-Football.
- Añadir tests en el mismo cambio que cada regla.
- No realizar llamadas reales en los tests.
- No ignorar silenciosamente mercados desconocidos.
- No inventar datos faltantes.
- Priorizar una versión funcional con mercados P0 antes de P1.
- Documentar cualquier desviación de este README en `docs/decisions/`.
- Si Playwright no funciona dentro de Vercel, mantener el importador vía CLI o navegador remoto; no migrar toda la app fuera de Vercel.
- Antes de finalizar, ejecutar lint, typecheck, unit tests, integration tests, E2E y build.
- Entregar también:
  - migraciones;
  - fixtures;
  - `.env.example`;
  - capturas de la vista desktop y móvil;
  - instrucciones de despliegue;
  - lista clara de mercados soportados y limitaciones conocidas.

---

## 31. Referencias técnicas

- Astro en Vercel: https://vercel.com/docs/frameworks/frontend/astro
- Astro on-demand rendering: https://docs.astro.build/en/guides/on-demand-rendering/
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- API-Football v3: https://www.api-football.com/documentation-v3
- Guía del Mundial 2026 de API-Football: https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports
- Playwright Network: https://playwright.dev/docs/network
- Playwright Mock APIs: https://playwright.dev/docs/mock
