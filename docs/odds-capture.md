# Captura de cuotas prepartido

La fuente real debe ser la URL publica del evento en Stake. Los fixtures HTML son solo para tests y debug.

## Modo recomendado: Chromium ya abierto

Arranca Chromium con remote debugging:

```bash
chromium --remote-debugging-port=9222 --user-data-dir=/tmp/stake-capture
```

Abre la URL del partido en ese navegador y verifica que ves las cuotas.

Luego captura:

```bash
pnpm odds:capture:cdp -- \
  --slug=australia-vs-rival \
  --stake-url="URL_DE_STAKE_DEL_PARTIDO" \
  --kickoff="2026-06-14T01:00:00.000Z" \
  --title="Australia vs Rival" \
  --competition="Mundial 2026"
```

Tambien puedes usar el wrapper:

```bash
scripts/capture-odds.sh cdp \
  --slug=australia-vs-rival \
  --stake-url="URL_DE_STAKE_DEL_PARTIDO" \
  --kickoff="2026-06-14T01:00:00.000Z" \
  --title="Australia vs Rival" \
  --competition="Mundial 2026"
```

## Alternativa: navegador visible automatico

```bash
pnpm odds:capture:headed -- \
  --slug=australia-vs-rival \
  --stake-url="URL_DE_STAKE_DEL_PARTIDO" \
  --kickoff="2026-06-14T01:00:00.000Z" \
  --title="Australia vs Rival" \
  --competition="Mundial 2026"
```

O con el wrapper:

```bash
scripts/capture-odds.sh headed \
  --slug=australia-vs-rival \
  --stake-url="URL_DE_STAKE_DEL_PARTIDO" \
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

## Salida

El comando escribe o actualiza:

```text
src/content/matches/<slug>.json
```

Ese JSON queda como fuente congelada de cuotas prepartido para el render estatico.
