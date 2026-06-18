Prompt para obtener el manifest de partidos del día

Necesito que generes un manifiesto de descubrimiento para **todos los partidos de hoy de la FIFA World Cup 2026**, considerando “hoy” según la zona horaria `America/Lima`.

Debes investigar los partidos del día, obtener sus fuentes oficiales, encontrar sus páginas individuales de ESPN o ESPN Deportes y descubrir las URLs exactas que Stake Perú asignó a cada encuentro.

Debes utilizar navegación web actual, búsquedas específicas y, cuando sea necesario, un navegador con JavaScript, Playwright o inspección de respuestas JSON/GraphQL.

No inventes URLs, slugs, IDs, horarios, sedes ni identificadores.

# Entrega

La respuesta debe contener:

1. Un informe breve de entre 3 y 8 líneas indicando:

   * Partidos encontrados.
   * Enlaces de Stake encontrados.
   * Páginas de ESPN encontradas.
   * Partidos que requieren revisión.
   * Limitaciones importantes.

2. Un archivo llamado:

```text
match-discovery-manifest-YYYY-MM-DD.json
```

donde `YYYY-MM-DD` sea la fecha objetivo en `America/Lima`.

Proporciona un enlace descargable al archivo.

Si no puedes crear archivos, entrega el manifiesto completo dentro de un bloque `json`.

El archivo debe contener JSON válido:

* Sin comentarios.
* Sin Markdown dentro del JSON.
* Sin comas finales.
* Sin texto adicional dentro del archivo.
* Sin valores inventados.

# Estructura general

```json
{
  "schema_version": "match-discovery-manifest.v2",
  "generated_at": "string",
  "generated_for": {
    "local_date": "string",
    "timezone": "America/Lima"
  },
  "search_window": {
    "from_utc": "string",
    "to_utc": "string"
  },
  "competition": {
    "id": "fifa-world-cup-2026",
    "name": "FIFA World Cup 2026",
    "season": "2026"
  },
  "matches": [],
  "rejected_candidates": [],
  "summary": {
    "matches_discovered": 0,
    "matches_ready_for_endpoint_discovery": 0,
    "matches_requiring_review": 0,
    "stake_pages_found": 0,
    "espn_pages_found": 0
  }
}
```

# 1. Fecha objetivo

1. Obtén la fecha y hora actuales reales.
2. Determina la fecha actual en `America/Lima`.
3. Usa esa fecha como `generated_for.local_date`.
4. `generated_at` debe ser el momento real de generación en UTC.
5. Calcula la ventana UTC correspondiente al día completo de Lima:

   * `from_utc`: 00:00:00 de Lima convertida a UTC.
   * `to_utc`: 23:59:59 de Lima convertida a UTC.
6. La pertenencia al día debe decidirse usando `kickoff.lima`, no la fecha UTC.
7. Incluye partidos de la madrugada UTC del día siguiente cuando todavía pertenezcan al día objetivo en Lima.

# 2. Descubrimiento del calendario

Encuentra todos los partidos de la FIFA World Cup 2026 que se juegan durante la fecha objetivo en `America/Lima`.

Prioridad de fuentes:

1. FIFA Match Centre y páginas oficiales de FIFA.
2. Documentos oficiales de FIFA.
3. ESPN o ESPN Deportes.
4. Otras fuentes deportivas reconocidas solamente como contraste.

Para cada partido determina:

* Equipo local.
* Equipo visitante.
* Hora UTC.
* Hora de Lima.
* Fase.
* Grupo.
* Jornada.
* Estadio.
* Ciudad.
* País.
* Estado del partido.

No inventes datos.

Cuando un dato no pueda verificarse:

* Usa `null` cuando el campo lo permita.
* Usa una cadena vacía en campos obligatorios de texto.
* Añade un elemento en `validation.issues`.
* Reduce la confianza.
* Marca `review_required: true` cuando corresponda.

# 3. Equipos y normalización

En los campos principales utiliza nombres canónicos en inglés y códigos FIFA de tres letras.

Ejemplo:

```json
"home_team": {
  "name": "Czechia",
  "short_name": "CZE",
  "canonical_id": null
}
```

Considera equivalentes estas variantes:

* `Czechia`, `Chequia`, `República Checa`
* `South Africa`, `Sudáfrica`
* `Switzerland`, `Suiza`
* `Bosnia and Herzegovina`, `Bosnia y Herzegovina`
* `Qatar`, `Catar`
* `South Korea`, `Korea Republic`, `Corea del Sur`
* `DR Congo`, `RD del Congo`, `República Democrática del Congo`
* `United States`, `Estados Unidos`
* `Netherlands`, `Países Bajos`

Puedes eliminar tildes, normalizar espacios, puntuación y mayúsculas para comparar nombres.

Nunca alteres una URL encontrada.

# 4. Candidate key

Construye cada `candidate_key` así:

```text
fifa-world-cup-2026-<home>-<away>-<kickoff_utc>
```

Reglas:

* Nombres en minúsculas.
* Sin tildes.
* Sin caracteres especiales.
* Palabras separadas por guiones.
* Finaliza con el kickoff UTC ISO 8601.

Ejemplo:

```text
fifa-world-cup-2026-czechia-south-africa-2026-06-18T16:00:00Z
```

# 5. Descubrimiento de Stake Perú

Página de referencia:

```text
https://stake.pe/deportes/world-2026
```

Dominio obligatorio:

```text
https://stake.pe
```

Ruta esperada:

```text
/deportes/football/world/fifa-world-cup/<slug>/event/<id>
```

El objetivo es obtener para cada partido:

* La URL exacta de Stake Perú.
* El slug asignado por Stake.
* El ID público posterior a `/event/`.

## 5.1 Regla fundamental

El ID de Stake es interno.

No debes:

* Calcularlo a partir del horario.
* Suponer que es consecutivo.
* Incrementar o disminuir el ID de otro partido.
* Usar el ID de FIFA, ESPN, Sportradar u otro proveedor.
* Inventar un ID.
* Construir el slug traduciendo manualmente los equipos.
* Usar URLs de `stake.com` como sustituto de `stake.pe`.
* Usar URLs de otro país o mercado.
* Afirmar que una URL fue extraída del DOM.
* Depender de cargar JavaScript o renderizar visualmente la página de Stake.

Solo acepta una URL cuando el `id` y el `slug` procedan de una fuente atribuible a Stake Perú o de una URL exacta de `stake.pe` ya indexada.

## 5.2 Orden obligatorio de métodos

Usa estos métodos en orden. Detente cuando encuentres una coincidencia inequívoca.

### Método A: búsqueda indexada exacta de Stake Perú

Realiza búsquedas web específicas para cada partido.

Consultas recomendadas:

```text
site:stake.pe/deportes/football/world/fifa-world-cup "<equipo 1>" "<equipo 2>"
```

```text
site:stake.pe/deportes/football/world/fifa-world-cup "<nombre español equipo 1>" "<nombre español equipo 2>"
```

```text
site:stake.pe "/event/" "<equipo 1>" "<equipo 2>" "FIFA World Cup"
```

```text
site:stake.pe/deportes/football/world/fifa-world-cup "<fecha>" "<equipo 1>"
```

Busca también variantes normalizadas y traducciones:

* `Czechia`, `Chequia`, `República Checa`
* `South Africa`, `Sudáfrica`
* `Switzerland`, `Suiza`
* `Bosnia and Herzegovina`, `Bosnia y Herzegovina`
* `Qatar`, `Catar`
* `South Korea`, `Corea del Sur`, `Korea Republic`
* `DR Congo`, `RD del Congo`, `República Democrática del Congo`

Acepta una URL únicamente cuando:

* El dominio sea exactamente `stake.pe`.
* La ruta contenga `/deportes/football/world/fifa-world-cup/`.
* La ruta contenga `/event/<id>`.
* La URL o el resultado identifique claramente a ambos equipos.
* La fecha o el contexto correspondan al encuentro correcto.
* No exista otro evento razonable entre los mismos equipos.

No necesitas abrir posteriormente la página individual.

Una URL exacta e inequívoca ya indexada bajo `stake.pe` puede considerarse autoritativa para el descubrimiento.

### Método B: código público o documentación técnica que reproduzca la fuente de primera parte de Stake

Si la búsqueda indexada no devuelve el encuentro, investiga implementaciones públicas recientes que documenten las consultas utilizadas por el frontend deportivo de Stake.

Busca operaciones o estructuras equivalentes a:

```text
slugTournament
fixtureList
slugSport
tournamentList
```

Los objetos de fixture relevantes pueden incluir:

```text
id
slug
name
startTime
competitors
teams
status
```

Solo utiliza este método cuando puedas identificar claramente:

* El endpoint de primera parte de Stake.
* La consulta o estructura utilizada.
* El `id` devuelto por Stake.
* El `slug` devuelto por Stake.
* Los dos equipos.
* La hora de inicio.
* La competición correspondiente.

Si una respuesta atribuible a Stake devuelve:

```json
{
  "id": "25681555",
  "slug": "republica-checa-vs-sudafrica",
  "startTime": "...",
  "competitors": [...]
}
```

puedes formar:

```text
https://stake.pe/deportes/football/world/fifa-world-cup/republica-checa-vs-sudafrica/event/25681555
```

Esto no se considera una URL inventada porque el `id` y el `slug` proceden de Stake.

No sustituyas el slug recibido por una traducción propia.

No uses implementaciones antiguas sin advertirlo. Si existe duda sobre la vigencia de la consulta o del endpoint, reduce la confianza y añade una incidencia.

### Método C: HTML, HAR o datos proporcionados por el usuario

Si el usuario proporciona alguno de estos elementos:

* HTML guardado.
* Archivo HAR.
* Respuesta JSON.
* Respuesta GraphQL.
* Lista de enlaces.
* Código fuente extraído desde su navegador.

trátalo como fuente válida.

En HTML:

1. Busca rutas que coincidan con:

```regex
/deportes/football/world/fifa-world-cup/[^"' ]+/event/[0-9]+
```

2. Relaciona cada ruta con los equipos y el horario disponibles.
3. Antepón `https://stake.pe` cuando la ruta sea relativa.
4. Extrae el ID posterior a `/event/`.
5. No abras ni vuelvas a validar la página individual.

En HAR, JSON o GraphQL:

1. Busca fixtures con `id`, `slug`, `startTime` y competidores.
2. Relaciona cada fixture con el calendario del día.
3. Construye la URL usando únicamente el `id` y el `slug` devueltos por Stake.

## 5.3 Extracción del ID

Para una URL como:

```text
https://stake.pe/deportes/football/world/fifa-world-cup/canada-vs-catar/event/25681550
```

genera:

```json
"stake": {
  "market": "PE",
  "locale": "es-PE",
  "discovery_status": "found",
  "event_url": "https://stake.pe/deportes/football/world/fifa-world-cup/canada-vs-catar/event/25681550",
  "public_page_id": "25681550",
  "confidence": 0.98
}
```

`public_page_id` debe ser exactamente el número posterior a `/event/`.

## 5.4 Confianza de Stake

Usa:

* `0.99`: el `id`, el `slug`, los equipos y el horario proceden directamente de una respuesta de primera parte de Stake o de material técnico aportado por el usuario.
* `0.98`: URL exacta indexada en `stake.pe`, con ambos equipos y contexto inequívoco.
* `0.97`: equipos y fecha coinciden, pero la hora no estaba visible.
* `0.90`: existe una ambigüedad menor, pero la asociación sigue siendo razonable.

No uses `0.99` para una URL encontrada únicamente mediante un resultado indexado.

No asignes confianza alta a una URL cuyo ID o slug hayan sido inferidos.

## 5.5 Cuándo usar `blocked` o `not_found`

Usa:

```json
"discovery_status": "blocked"
```

solo cuando no fue posible acceder a ninguna fuente útil:

* Resultados indexados.
* Documentación técnica.
* Código público reciente.
* HTML, HAR o datos proporcionados por el usuario.

Usa:

```json
"discovery_status": "not_found"
```

cuando fue posible investigar, pero no se encontró una URL inequívoca.

No uses `blocked` porque no pudiste abrir la página individual.

No es obligatorio abrir la página individual.

## 5.6 Reglas de validación de Stake

Antes de marcar una URL como `found`, comprueba:

1. Comienza con `https://stake.pe`.
2. Contiene `/deportes/football/world/fifa-world-cup/`.
3. Contiene `/event/<id>`.
4. El `public_page_id` coincide con el número posterior a `/event/`.
5. Ambos equipos corresponden al partido.
6. La fecha o el contexto son compatibles.
7. El slug y el ID no fueron inventados.
8. El ID no fue calculado de forma secuencial.
9. No se utilizó una URL de otro mercado.
10. No se afirma falsamente que la URL fue extraída del DOM.

Regla crítica:

**Para Stake, prioriza una URL exacta e inequívoca ya indexada bajo `stake.pe`. Si no aparece, utiliza únicamente un `id` y un `slug` obtenidos de una respuesta o implementación técnica atribuible a Stake. También puedes usar HTML, HAR o datos aportados por el usuario. Nunca adivines el ID, nunca lo calcules de forma secuencial y nunca construyas el slug mediante traducción manual.**

# 6. Descubrimiento de ESPN

Encuentra para cada partido una página individual de ESPN Deportes o ESPN.

Formatos habituales:

```text
https://espndeportes.espn.com/futbol/partido/_/juegoId/<event_id>/<slug>
```

```text
https://www.espn.com/soccer/match/_/gameId/<event_id>/<slug>
```

Busca usando:

* Ambos equipos.
* Fecha.
* FIFA World Cup 2026.
* ESPN o ESPN Deportes.

Prioriza ESPN Deportes.

Comprueba:

* Ambos equipos.
* Fecha.
* Competición.
* Que sea una página individual del partido.

No aceptes:

* Noticias.
* Previas editoriales.
* Calendarios generales.
* Páginas de equipo.
* Amistosos anteriores.
* Eliminatorias.
* Partidos de otra competición.

Extrae el ID directamente de:

```text
/juegoId/<id>/
```

o:

```text
/gameId/<id>/
```

El orden de los equipos en el slug puede ser diferente.

No inventes el ID.

Ejemplo:

```json
"espn": {
  "discovery_status": "found",
  "match_url": "https://espndeportes.espn.com/futbol/partido/_/juegoId/760438/sudafrica-chequia",
  "event_id": "760438",
  "confidence": 0.99
}
```

# 7. Fuentes del calendario

Cada fuente debe tener:

```json
{
  "url": "string",
  "source_type": "official",
  "retrieved_at": "string",
  "supports": [
    "competition",
    "teams",
    "kickoff",
    "venue",
    "stage"
  ],
  "confidence": 1.0
}
```

Incluye en `supports` únicamente los datos realmente respaldados por esa fuente.

Puedes usar varias fuentes.

# 8. Estado y perfil

Usa:

```json
"monitoring_profile": "world_cup_public_sources_v2"
```

Estados permitidos:

* `scheduled`
* `live`
* `finished`
* `postponed`
* `cancelled`
* `unknown`

# 9. Estructura de cada partido

```json
{
  "candidate_key": "string",
  "home_team": {
    "name": "string",
    "short_name": "string",
    "canonical_id": null
  },
  "away_team": {
    "name": "string",
    "short_name": "string",
    "canonical_id": null
  },
  "stage": {
    "type": "string",
    "name": "string",
    "group": "string o null",
    "matchday": "number o null"
  },
  "venue": {
    "name": "string",
    "host_city": "string",
    "country": "string"
  },
  "kickoff": {
    "utc": "string",
    "lima": "string"
  },
  "match_status": "string",
  "monitoring_profile": "world_cup_public_sources_v2",
  "sources": {
    "schedule": [],
    "stake": {
      "market": "PE",
      "locale": "es-PE",
      "discovery_status": "string",
      "event_url": "string",
      "public_page_id": "string",
      "confidence": 0.0
    },
    "espn": {
      "discovery_status": "string",
      "match_url": "string",
      "event_id": "string",
      "confidence": 0.0
    }
  },
  "validation": {
    "overall_confidence": 0.0,
    "review_required": false,
    "issues": []
  }
}
```

# 10. Validación

Marca:

```json
"review_required": true
```

cuando:

* No se encontró una URL de Stake inequívoca.
* Stake fue completamente inaccesible.
* ESPN no fue encontrado.
* Existe conflicto de horario.
* Existe conflicto entre equipos.
* La sede no pudo verificarse.
* La fase no pudo verificarse.
* La confianza general es inferior a `0.90`.
* Existen dos candidatos razonables para el mismo evento.
* Se detectó un posible duplicado.

No marques revisión únicamente porque la página individual de Stake no pudo abrirse.

Issues permitidos:

* `stake_source_page_blocked`
* `stake_event_href_not_found`
* `stake_event_ambiguous`
* `stake_candidate_time_mismatch`
* `stake_candidate_team_mismatch`
* `stake_graphql_fixture_not_found`
* `stake_indexed_url_not_found`
* `espn_match_url_not_found`
* `espn_candidate_time_mismatch`
* `utc_date_differs_from_lima_date`
* `schedule_source_conflict`
* `home_away_order_conflict`
* `venue_not_verified`
* `stage_not_verified`
* `duplicate_candidate`

Ejemplo informativo:

```json
{
  "code": "utc_date_differs_from_lima_date",
  "severity": "info",
  "message": "El kickoff ocurre durante el día siguiente en UTC, pero pertenece a la fecha objetivo en America/Lima."
}
```

# 11. Confianza general

Calcula `overall_confidence` considerando:

* Calendario oficial.
* Coincidencia de equipos.
* Coincidencia de horario.
* Sede.
* Fase.
* URL de Stake.
* URL de ESPN.

Guía:

* `0.99`: todas las fuentes principales fueron confirmadas.
* `0.95` a `0.98`: falta un dato secundario, pero no existe ambigüedad.
* `0.90` a `0.94`: existe una limitación menor.
* Menor de `0.90`: requiere revisión.

# 12. Candidatos rechazados

Incluye únicamente candidatos que parecían razonables y fueron evaluados.

Ejemplo:

```json
{
  "source": "espn",
  "candidate_url": "string",
  "reason_code": "wrong_date_and_competition",
  "message": "La página corresponde a un partido anterior o a otra competición."
}
```

No llenes la lista con resultados evidentemente irrelevantes.

# 13. Resumen

Calcula:

```json
"summary": {
  "matches_discovered": 0,
  "matches_ready_for_endpoint_discovery": 0,
  "matches_requiring_review": 0,
  "stake_pages_found": 0,
  "espn_pages_found": 0
}
```

Definiciones:

* `matches_discovered`: total de partidos válidos del día en Lima.
* `matches_ready_for_endpoint_discovery`: partidos con calendario confirmado, Stake `found` y ESPN `found`.
* `matches_requiring_review`: partidos con `review_required: true`.
* `stake_pages_found`: partidos con Stake `found`.
* `espn_pages_found`: partidos con ESPN `found`.

# 14. Comprobaciones finales

Antes de entregar:

1. Valida que el archivo sea JSON válido.
2. Confirma que todos los partidos pertenecen a la fecha objetivo en Lima.
3. Ordena los partidos cronológicamente por `kickoff.lima`.
4. Confirma que cada `candidate_key` sea único.
5. Confirma que cada URL de Stake marcada como `found`:

   * Comience con `https://stake.pe`.
   * Contenga `/deportes/football/world/fifa-world-cup/`.
   * Contenga `/event/<id>`.
   * Use un `id` y `slug` obtenidos de Stake, no inferidos.
6. Confirma que `public_page_id` coincida con el número posterior a `/event/`.
7. No rechaces una URL de Stake porque la página individual no pudo abrirse.
8. No intentes calcular IDs consecutivos.
9. Confirma que cada URL de ESPN sea una página individual.
10. Confirma que cada ID de ESPN coincida con su URL.
11. Confirma que los conteos de `summary` coincidan con `matches`.
12. Confirma que no se inventó ningún enlace ni identificador.
13. Incluye todos los partidos del día, incluso los que ocurran en la madrugada UTC del día siguiente.

Regla crítica:

**Para Stake, prioriza el `href` del DOM. Si no está disponible, acepta el `id` y `slug` obtenidos de una respuesta JSON/GraphQL de primera parte de Stake. Como último recurso, acepta una URL exacta e inequívoca ya indexada bajo `stake.pe`. Nunca adivines el ID, nunca lo calcules de forma secuencial y nunca construyas el slug por traducción manual.**
