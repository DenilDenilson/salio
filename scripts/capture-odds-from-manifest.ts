// Leer un archivo como data/matches/2026-06-16.json.
// Recorrer todos los partidos de matches.
// Validar si cada partido tiene la información necesaria.
// Construir los parámetros para pnpm odds:capture.
// Ejecutar una captura por cada partido válido.
// Omitir partidos incompletos o que requieren revisión.
// Mostrar un resumen final.

import { readFile } from "node:fs/promises"

const text = await readFile(
    "data/matches/2026-06-16.json",
    "utf8"
)

const manifest = JSON.parse(text)

if (!Array.isArray(manifest.matches)) throw new Error("El archivo no contiene matches[]")

for (const match of manifest.matches) {
    const name = `${match.home_team?.name} vs ${match.away_team?.name}`;
    const errors = validateMatch(match, manifest)

    if (errors.length > 0) {
        console.log(`❌ ${name}`)

        for (const error of errors) {
            console.log(`   - ${error}`)
        }

        continue
    }

    const kickoff = new Date(match.kickoff.utc)

    const captureAt = new Date(
        kickoff.getTime() - 2 * 60 * 60 * 1000
    )

    // Si llegamos acá es que tienen 
    const stakeUrl = match.sources.stake.event_url
    const stakeApiUrl = match.sources.stake.internal_endpoint

    const slug = new URL(stakeUrl)
        .pathname
        .split("/event/")[0]
        .split("/")
        .at(-1)

    const title = `${match.home_team.name} vs ${match.away_team.name}`

    const args = [
        "odds:capture",
        "--",
        `--slug=${slug}`,
        `--stake-url=${stakeUrl}`,
        `--stake-api-url=${stakeApiUrl}`,
        `--kickoff=${kickoff.toISOString()}`,
        `--title=${title}`,
        "--competition=Mundial 2026",
    ]

    console.log(`✅ ${name}: listo para odds:capture`)
    console.log(`   Captura: ${captureAt.toISOString()}`)
    console.log("   Argumentos:", args)
}

function validateMatch(match: any, manifest: any): string[] {
    const errors: string[] = []

    const stakeUrl = match.sources?.stake?.event_url
    const stakeApiUrl = match.sources?.stake?.internal_endpoint
    const kickoffValue = match.kickoff?.utc

    if(!stakeUrl) errors.push("Falta stakeUrl")
    if (!stakeApiUrl) errors.push("Falta stakeApiUrl")
    if (!kickoffValue) errors.push("Falta kickoff")

    // No seguimos validando si no tienen esos valores
    if (!stakeUrl || !stakeApiUrl || !kickoffValue) return errors

    const stakeEventId = stakeUrl.match(/\/event\/(\d+)/)?.[1]
    const stakeApiEventId = stakeApiUrl.match(/\/es\/pe\/(\d+)\//)?.[1]

    if (!stakeEventId) {
        errors.push("La URL pública de Stake no contiene un event ID")
    }

    if (!stakeApiEventId) {
        errors.push("La URL API de Stake no contiene un event ID")
    }

    if (
        stakeEventId &&
        stakeApiEventId &&
        stakeEventId !== stakeApiEventId
    ) {
        errors.push(
            `Los IDs de Stake no coinciden: ${stakeEventId} !== ${stakeApiEventId}`
        )
    }

    const kickoff = new Date(kickoffValue)

    if (Number.isNaN(kickoff.getTime())) {
        errors.push(`Kickoff inválido: ${kickoffValue}`)
        return errors
    }

    const localDate = getDateInTimezone(
        kickoff,
        manifest.generated_for?.timezone ?? "America/Lima"
    )

    const expectedDate = manifest.generated_for?.local_date

    if (expectedDate && localDate !== expectedDate) {
        errors.push(
            `El partido corresponde al ${localDate}, no al ${expectedDate}`
        )
    }

    const searchFrom = new Date(manifest.search_window?.from_utc)
    const searchTo = new Date(manifest.search_window?.to_utc)

    if (
        !Number.isNaN(searchFrom.getTime()) &&
        !Number.isNaN(searchTo.getTime()) &&
        (kickoff < searchFrom || kickoff > searchTo)
    ) {
        errors.push("El kickoff está fuera del search_window")
    }

    if (match.validation?.review_required) {
    errors.push("El partido requiere revisión")
    }

    if (match.sources?.stake?.discovery_status !== "found") {
        errors.push("El evento de Stake no está confirmado")
    }

    return errors
}

function getDateInTimezone(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date)
}