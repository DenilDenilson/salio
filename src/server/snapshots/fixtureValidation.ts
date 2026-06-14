import { isFinalStatus } from "../../domain/model";
import { AppError } from "../errors";
import {
  FIXTURE_KICKOFF_TOLERANCE_MINUTES,
  competitionLeagueSlugForName,
  normalizeProviderTeamName,
} from "../providers/teamNormalization";
import { type ProviderFixture } from "../providers/types";
import { type MatchSnapshot } from "./schema";

const finalizableProviderStatuses = new Set(["FT"]);

export function assertRemoteFixtureMatchesSnapshot(
  snapshot: MatchSnapshot,
  fixture: ProviderFixture,
  requestedEventId: string,
): void {
  const expected = `${snapshot.homeTeamName} vs ${snapshot.awayTeamName}`;
  const received = `${fixture.homeTeamName ?? "desconocido"} vs ${
    fixture.awayTeamName ?? "desconocido"
  }`;
  const expectedLeagueSlug = competitionLeagueSlugForName(
    snapshot.competitionName,
  );
  const competition = snapshot.competitionName ?? "competicion desconocida";
  const receivedCompetition =
    fixture.competitionName ?? "competicion desconocida";

  const mismatch = (detail: string) => {
    throw new AppError(
      "SPORTS_FIXTURE_MISMATCH",
      `El evento ${requestedEventId} no corresponde al snapshot ${snapshot.slug}.
Esperado: ${expected}, ${competition}.
Recibido: ${received}, ${receivedCompetition}.
${detail}
No se modifico el snapshot.`,
    );
  };

  if (fixture.eventId !== requestedEventId) {
    mismatch(`El proveedor devolvio el evento ${fixture.eventId}.`);
  }

  if (
    normalizeProviderTeamName(snapshot.homeTeamName) !==
      normalizeProviderTeamName(fixture.homeTeamName ?? "") ||
    normalizeProviderTeamName(snapshot.awayTeamName) !==
      normalizeProviderTeamName(fixture.awayTeamName ?? "")
  ) {
    mismatch("Los equipos o la orientacion local/visitante no coinciden.");
  }

  if (expectedLeagueSlug && fixture.leagueSlug !== expectedLeagueSlug) {
    mismatch(
      `Liga incorrecta: se esperaba ${expectedLeagueSlug} y se recibio ${
        fixture.leagueSlug ?? "desconocida"
      }.`,
    );
  }

  const kickoffDeltaMinutes =
    Math.abs(
      new Date(fixture.kickoffAt).getTime() -
        new Date(snapshot.kickoffAt).getTime(),
    ) / 60_000;
  if (kickoffDeltaMinutes > FIXTURE_KICKOFF_TOLERANCE_MINUTES) {
    mismatch(
      `Horario fuera de tolerancia: diferencia de ${Math.round(
        kickoffDeltaMinutes,
      )} minutos.`,
    );
  }

  if (fixture.score.home === null || fixture.score.away === null) {
    mismatch("El marcador final no esta disponible.");
  }
}

export function assertFixtureIsFinalizable(fixture: ProviderFixture): void {
  const providerStatus = fixture.providerStatus;
  const finalizable = providerStatus
    ? isFinalizableProviderStatus(providerStatus)
    : isFinalStatus(fixture.status);

  if (!finalizable) {
    throw new AppError(
      "SPORTS_FIXTURE_NOT_FINISHED",
      `El fixture existe y coincide, pero todavia no esta finalizado.
Estado actual: ${providerStatus ?? fixture.status}.
No se modifico el snapshot.`,
    );
  }
}

export function isFinalizableProviderStatus(status: string): boolean {
  return finalizableProviderStatuses.has(status);
}
