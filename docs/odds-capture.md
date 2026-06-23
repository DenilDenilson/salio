# Captura de cuotas prepartido

La captura real es API-only. Debes pasar siempre:

- La URL publica del evento en Stake.
- La URL interna completa `single-pre-event.json`, incluyendo `hidenseek`.

El sistema no construye, descubre, corrige ni reutiliza la URL interna. Solo la
valida y la usa exactamente como fue recibida.

```bash
pnpm odds:capture -- \
  --slug=australia-vs-rival \
  --stake-url="URL_PUBLICA_DE_STAKE_DEL_PARTIDO" \
  --stake-api-url="URL_INTERNA_COMPLETA_SINGLE_PRE_EVENT_JSON" \
  --kickoff="2026-06-14T01:00:00.000Z" \
  --title="Australia vs Rival" \
  --competition="Mundial 2026"
```

Con wrapper:

```bash
scripts/capture-odds.sh \
  --slug=australia-vs-rival \
  --stake-url="URL_PUBLICA_DE_STAKE_DEL_PARTIDO" \
  --stake-api-url="URL_INTERNA_COMPLETA_SINGLE_PRE_EVENT_JSON" \
  --kickoff="2026-06-14T01:00:00.000Z" \
  --title="Australia vs Rival" \
  --competition="Mundial 2026"
```

## Hora kickoff

`--kickoff` siempre va en UTC. Para Peru, suma 5 horas.

Ejemplo: si el partido empieza a las 8:00 p. m. en Peru el 13 de junio, usa:

```text
2026-06-14T01:00:00.000Z
```

## Evidencia

Para guardar el payload original sin modificar:

```bash
pnpm odds:capture -- \
  --slug=australia-vs-rival \
  --stake-url="URL_PUBLICA_DE_STAKE_DEL_PARTIDO" \
  --stake-api-url="URL_INTERNA_COMPLETA_SINGLE_PRE_EVENT_JSON" \
  --save-raw-api="data/evidence/stake-api/australia-vs-rival.json" \
  --kickoff="2026-06-14T01:00:00.000Z" \
  --title="Australia vs Rival"
```

La URL persistida en logs/evidencia se sanitiza para no mostrar `hidenseek`.

## Diagnostico de transporte

Para comparar `fetch` nativo de Node contra `curl`, usando exactamente la misma
URL interna:

```bash
pnpm stake:diagnose -- \
  --stake-url="URL_PUBLICA_DE_STAKE_DEL_PARTIDO" \
  --stake-api-url="URL_INTERNA_COMPLETA_SINGLE_PRE_EVENT_JSON"
```

El comando solo imprime:

- transporte utilizado;
- status HTTP;
- content-type;
- tamaño de respuesta;
- URL con `hidenseek` censurado.

No imprime el cuerpo ni el token.

## Salida

El comando escribe o actualiza:

```text
src/content/matches/<slug>.json
```

Ese JSON queda como fuente congelada de cuotas prepartido para el render
estatico.
