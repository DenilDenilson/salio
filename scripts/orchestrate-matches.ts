import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const [mode, manifestArgument, indexArgument] = process.argv.slice(2);

if (mode === "--self-test") {
  const kickoff = new Date("2026-06-17T20:00:00Z");

  assert.equal(
    _stakeCaptureTime(kickoff).toISOString(),
    "2026-06-17T19:00:00.000Z",
  );

  assert.equal(
    _resultCheckTime(kickoff).toISOString(),
    "2026-06-17T22:00:00.000Z",
  );

  assert.equal(
    _slugFromStakeUrl(
      "https://stake.pe/deportes/football/world/fifa-world-cup/inglaterra-vs-croacia/event/21798337",
    ),
    "inglaterra-vs-croacia",
  );

  assert.equal(
    _isEspnFinal({
      header: {
        competitions: [
          {
            status: {
              type: {
                completed: true,
              },
            },
          },
        ],
      },
    }),
    true,
  );

  console.log("✅ self-test passed");
  process.exit(0);
}

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  throw new Error("Este script debe ejecutarse mediante pnpm");
}

// Las rutas reales permanecen válidas aunque fnm cambie su multishell.
const nodePath = await realpath(process.execPath);
const pnpmPath = await realpath(npmExecPath);

const projectDirectory = process.cwd();
const orchestratorPath = resolve("scripts/orchestrate-matches.ts");
const endpointFinderPath = resolve("scripts/find-network-endpoint.ts");

if (mode === "--stake") {
  await captureStake(_required(manifestArgument, "manifest"), _parseIndex(indexArgument));
  process.exit(0);
}

if (mode === "--result") {
  await watchResult(_required(manifestArgument, "manifest"), _parseIndex(indexArgument));
  process.exit(0);
}

if (!mode) {
  throw new Error(
    "Uso: pnpm exec tsx scripts/orchestrate-matches.ts <manifest.json>",
  );
}

await scheduleManifest(resolve(mode));

async function scheduleManifest(manifestPath: string): Promise<void> {
  const manifest = await _readManifest(manifestPath);

  // Validamos todos antes de crear timers para evitar una programación parcial.
  const matches = manifest.matches.map((_, index) =>
    _getMatch(manifest, index),
  );

  for (const [index, match] of matches.entries()) {
    await _schedule({
      unit: `salio-stake-${match.slug}`,
      runAt: _stakeCaptureTime(match.kickoff),
      mode: "--stake",
      manifestPath,
      index,
    });

    await _schedule({
      unit: `salio-result-${match.slug}`,
      runAt: _resultCheckTime(match.kickoff),
      mode: "--result",
      manifestPath,
      index,
    });
  }
}

async function captureStake(
  manifestPath: string,
  index: number,
): Promise<void> {
  const match = _getMatch(await _readManifest(manifestPath), index);
  console.log(`🔎 Descubriendo endpoint de Stake para ${match.slug}`);

  const output = await _capture(nodePath, [
    pnpmPath,
    "exec",
    "tsx",
    endpointFinderPath,
    match.stakeUrl,
    "single-pre-event.json",
  ]);

  const endpoint = _extractStakeEndpoint(output);

  console.log(`📥 Capturando cuotas de ${match.title}`);

  await _run(nodePath, [
    pnpmPath,
    "odds:capture",
    "--",
    `--slug=${match.slug}`,
    `--stake-url=${match.stakeUrl}`,
    `--stake-api-url=${endpoint}`,
    `--kickoff=${match.kickoff.toISOString()}`,
    `--title=${match.title}`,
    `--competition=${match.competition}`,
    `--timezone=${match.timezone}`,
  ]);
}

async function watchResult(
  manifestPath: string,
  index: number,
): Promise<void> {
  const match = _getMatch(await _readManifest(manifestPath), index);

  const endpoint =
    "https://site.api.espn.com/apis/site/v2/sports/" +
    `soccer/fifa.world/summary?event=${match.espnEventId}`;

  // ponytail: consulta indefinidamente cada 10 minutos.
  // Si luego necesitas manejar partidos suspendidos, añade un deadline.
  while (true) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`ESPN respondió HTTP ${response.status}`);
      }

      const summary = await response.json();

      if (_isEspnFinal(summary)) {
        console.log(`✅ ESPN confirmó el final de ${match.title}`);
        break;
      }

      console.log(
        `⏳ ${match.title} todavía no terminó; próximo intento en 10 minutos`,
      );
    } catch (error) {
      console.error(
        `⚠️ ${match.title}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await _sleep(10 * MINUTE);
  }

  console.log("⏳ Esperando 25 minutos para consolidar estadísticas...");
  await _sleep(25 * MINUTE);

  await _run(nodePath, [
    pnpmPath,
    "match:finalize",
    "--",
    `--slug=${match.slug}`,
    `--event-id=${match.espnEventId}`,
  ]);
}





// FUNCIONES AUXILIARES

async function _schedule(input: {
  unit: string;
  runAt: Date;
  mode: "--stake" | "--result";
  manifestPath: string;
  index: number;
}): Promise<void> {
  if (input.runAt.getTime() <= Date.now()) {
    console.log(`⏭️ ${input.unit}: la hora ya pasó`);
    return;
  }

  await _run("systemd-run", [
    "--user",
    "--collect",
    `--unit=${input.unit}`,
    `--on-calendar=${_toSystemdDate(input.runAt)}`,
    "--timer-property=AccuracySec=1s",
    "--timer-property=Persistent=true",
    `--working-directory=${projectDirectory}`,
    "--setenv=HEADLESS=1",
    nodePath,
    pnpmPath,
    "exec",
    "tsx",
    orchestratorPath,
    input.mode,
    input.manifestPath,
    String(input.index),
  ]);

  console.log(`✅ ${input.unit}: ${input.runAt.toISOString()}`);
}

function _stakeCaptureTime(kickoff: Date): Date {
  return new Date(kickoff.getTime() - HOUR);
}

function _resultCheckTime(kickoff: Date): Date {
  return new Date(kickoff.getTime() + 2 * HOUR);
}

function _slugFromStakeUrl(stakeUrl: string): string {
  const segments = new URL(stakeUrl).pathname
    .split("/")
    .filter(Boolean);

  const eventIndex = segments.lastIndexOf("event");
  const slug = segments[eventIndex - 1];

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Slug inválido en ${stakeUrl}`);
  }

  return slug;
}

function _isEspnFinal(summary: unknown): boolean {
  const value = summary as {
    header?: {
      competitions?: Array<{
        status?: {
          type?: {
            completed?: boolean;
            state?: string;
          };
        };
      }>;
    };
  };

  const type = value.header?.competitions?.[0]?.status?.type;

  return type?.completed === true || type?.state === "post";
}



function _getMatch(manifest: Manifest, index: number): Match {
  const raw = _asObject(manifest.matches[index], `matches[${index}]`);
  const home = _asObject(raw.home_team, "home_team");
  const away = _asObject(raw.away_team, "away_team");
  const kickoffObject = _asObject(raw.kickoff, "kickoff");
  const sources = _asObject(raw.sources, "sources");
  const stake = _asObject(sources.stake, "sources.stake");
  const espn = _asObject(sources.espn, "sources.espn");
  const validation = _asObject(raw.validation, "validation");

  if (validation.review_required === true) {
    throw new Error(`matches[${index}] requiere revisión`);
  }

  if (stake.discovery_status !== "found") {
    throw new Error(`matches[${index}]: Stake no encontrado`);
  }

  if (espn.discovery_status !== "found") {
    throw new Error(`matches[${index}]: ESPN no encontrado`);
  }

  const stakeUrl = _required(
    stake.event_url,
    "sources.stake.event_url",
  );

  const stakeParsed = new URL(stakeUrl);

  if (
    stakeParsed.protocol !== "https:" ||
    stakeParsed.hostname !== "stake.pe"
  ) {
    throw new Error(`URL de Stake inválida: ${stakeUrl}`);
  }

  const stakeId =
    stakeParsed.pathname.match(/\/event\/(\d+)\/?$/)?.[1];

  const declaredStakeId = _required(
    stake.public_page_id,
    "sources.stake.public_page_id",
  );

  if (!stakeId || stakeId !== declaredStakeId) {
    throw new Error(
      `Stake ID no coincide: ${stakeId ?? "ausente"} !== ${declaredStakeId}`,
    );
  }

  const espnEventId = _required(
    espn.event_id,
    "sources.espn.event_id",
  );

  const espnMatchUrl = _required(
    espn.match_url,
    "sources.espn.match_url",
  );

  const espnUrlId =
    new URL(espnMatchUrl).pathname.match(/\/juegoId\/(\d+)/)?.[1];

  if (!/^\d+$/.test(espnEventId) || espnUrlId !== espnEventId) {
    throw new Error(`ESPN event ID inválido: ${espnEventId}`);
  }

  const kickoff = new Date(
    _required(kickoffObject.utc, "kickoff.utc"),
  );

  if (Number.isNaN(kickoff.getTime())) {
    throw new Error(`Kickoff inválido en matches[${index}]`);
  }

  return {
    slug: _slugFromStakeUrl(stakeUrl),
    title:
      `${_required(home.name, "home_team.name")} vs ` +
      _required(away.name, "away_team.name"),
    competition: manifest.competition,
    timezone: manifest.timezone,
    kickoff,
    stakeUrl,
    espnEventId,
  };
}

async function _readManifest(path: string): Promise<Manifest> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const manifest = _asObject(parsed, "manifest");

  if (manifest.schema_version !== "match-discovery-manifest.v2") {
    throw new Error("El manifiesto no es match-discovery-manifest.v2");
  }

  const generatedFor = _asObject(
    manifest.generated_for,
    "generated_for",
  );

  const competition = _asObject(
    manifest.competition,
    "competition",
  );

  if (!Array.isArray(manifest.matches)) {
    throw new Error("El manifiesto no contiene matches[]");
  }

  return {
    timezone: _required(generatedFor.timezone, "generated_for.timezone"),
    competition: _required(competition.name, "competition.name"),
    matches: manifest.matches,
  };
}

function _asObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} debe ser un objeto`);
  }

  return value as Record<string, unknown>;
}

function _required(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} es obligatorio`);
  }

  return value;
}

function _capture(
  command: string,
  args: string[],
): Promise<string> {
  return new Promise((resolveCapture, reject) => {
    const child = spawn(command, args, {
      cwd: projectDirectory,
      env: {
        ...process.env,
        HEADLESS: "1",
      },
      stdio: ["ignore", "pipe", "inherit"],
      shell: false,
    });

    const output: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => {
      output.push(chunk);
    });

    child.once("error", reject);

    child.once("close", (code) => {
      if (code === 0) {
        resolveCapture(Buffer.concat(output).toString("utf8"));
      } else {
        reject(new Error(`${command} terminó con código ${code}`));
      }
    });
  });
}

function _parseIndex(value: string | undefined): number {
  const index = Number(value);

  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Índice inválido: ${value ?? ""}`);
  }

  return index;
}

function _extractStakeEndpoint(output: string): string {
  const endpoint = output
    .match(/https:\/\/\S+\/single-pre-event\.json\?\S+/g)
    ?.at(-1);

  if (!endpoint) {
    throw new Error("No se encontró el endpoint interno de Stake");
  }

  return endpoint;
}

function _toSystemdDate(date: Date): string {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}

function _run(
  command: string,
  args: string[],
): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: projectDirectory,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });

    child.once("error", reject);

    child.once("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        reject(new Error(`${command} terminó con código ${code}`));
      }
    });
  });
}

function _sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) =>
    setTimeout(resolveSleep, milliseconds),
  );
}


interface Manifest {
  timezone: string;
  competition: string;
  matches: unknown[];
}

interface Match {
  slug: string;
  title: string;
  competition: string;
  timezone: string;
  kickoff: Date;
  stakeUrl: string;
  espnEventId: string;
}
