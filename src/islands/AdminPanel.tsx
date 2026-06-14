import { useState } from "react";
import type { FixtureCandidate } from "../server/providers/types";
import type { MatchSummary } from "../domain/model";

interface Props {
  matches: MatchSummary[];
  csrfToken: string;
}

export default function AdminPanel({ matches, csrfToken }: Props) {
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState<
    Record<string, FixtureCandidate[]>
  >({});

  async function post(path: string, body: Record<string, unknown> = {}) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      candidates?: FixtureCandidate[];
    };
    if (!response.ok) {
      throw new Error(payload.error ?? "Operación fallida");
    }
    return payload;
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("/api/admin/matches", {
      slug: String(form.get("slug")),
      title: String(form.get("title")),
      homeTeamName: String(form.get("homeTeamName")),
      awayTeamName: String(form.get("awayTeamName")),
      competitionName: String(form.get("competitionName")),
      kickoffAt: new Date(String(form.get("kickoffAt"))).toISOString(),
      timezone: String(form.get("timezone")),
      stakeUrl: String(form.get("stakeUrl")),
    });
    window.location.reload();
  }

  async function run(label: string, action: () => Promise<void>) {
    try {
      setMessage(`${label}...`);
      await action();
      setMessage(`${label}: listo.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operación fallida");
    }
  }

  return (
    <main className="metal-shell">
      <section className="metal-header">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-semibold text-ink">Administración</h1>
          <p className="mt-1 text-sm text-neutral">
            Importación, mapping, congelamiento y publicación.
          </p>
          {message ? (
            <p className="metal-panel mt-3 rounded-md p-3 text-sm">{message}</p>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[22rem_1fr] lg:px-8">
        <form className="metal-card rounded-md p-4" onSubmit={handleCreate}>
          <h2 className="text-lg font-semibold">Crear partido</h2>
          <Field name="slug" label="Slug" defaultValue="canada-vs-bosnia" />
          <Field
            name="title"
            label="Título"
            defaultValue="Canadá vs Bosnia y Herzegovina"
          />
          <Field name="homeTeamName" label="Local" defaultValue="Canadá" />
          <Field
            name="awayTeamName"
            label="Visitante"
            defaultValue="Bosnia y Herzegovina"
          />
          <Field
            name="competitionName"
            label="Competición"
            defaultValue="Copa Mundial 2026 · Grupo B"
          />
          <Field
            name="kickoffAt"
            label="Inicio"
            type="datetime-local"
            defaultValue="2026-06-12T14:00"
          />
          <Field
            name="timezone"
            label="Zona horaria"
            defaultValue="America/Lima"
          />
          <Field
            name="stakeUrl"
            label="URL Stake"
            defaultValue="https://stake.pe/deportes/futbol/world-cup/event-canada-bosnia-demo"
          />
          <button
            className="mt-4 w-full rounded-md border border-accent bg-accent/20 px-3 py-2 font-medium text-accent shadow-[0_0_18px_rgba(52,214,255,0.16)]"
            type="submit"
          >
            Crear
          </button>
        </form>

        <div className="space-y-4">
          {matches.map((match) => (
            <article className="metal-card rounded-md p-4" key={match.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{match.title}</h2>
                  <p className="text-sm text-neutral">
                    {match.slug} · Fixture{" "}
                    {match.apiFootballFixtureId ?? "sin confirmar"} ·{" "}
                    {match.published ? "Publicado" : "Borrador"}
                  </p>
                </div>
                <a
                  className="text-sm font-medium text-accent"
                  href={`/partidos/${match.slug}`}
                >
                  Ver página
                </a>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-md border border-line bg-panel px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                  type="button"
                  onClick={() =>
                    run("Importar Stake", async () => {
                      await post(
                        `/api/admin/matches/${match.id}/import-stake`,
                        { url: match.stakeUrl },
                      );
                      window.location.reload();
                    })
                  }
                >
                  Importar Stake
                </button>
                <button
                  className="rounded-md border border-line bg-panel px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                  type="button"
                  onClick={() =>
                    run("Buscar fixture", async () => {
                      const payload = await post(
                        `/api/admin/matches/${match.id}/fixture-candidates`,
                      );
                      setCandidates((current) => ({
                        ...current,
                        [match.id]: payload.candidates ?? [],
                      }));
                    })
                  }
                >
                  Buscar fixture
                </button>
                <button
                  className="rounded-md border border-line bg-panel px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                  type="button"
                  onClick={() =>
                    run("Congelar", async () => {
                      await post(`/api/admin/matches/${match.id}/freeze-odds`);
                      window.location.reload();
                    })
                  }
                >
                  Congelar
                </button>
                <button
                  className="rounded-md border border-line bg-panel px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                  type="button"
                  onClick={() =>
                    run("Publicar", async () => {
                      await post(`/api/admin/matches/${match.id}/publish`);
                      window.location.reload();
                    })
                  }
                >
                  Publicar
                </button>
                <button
                  className="rounded-md border border-line bg-panel px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                  type="button"
                  onClick={() =>
                    run("Refresh", async () =>
                      post(`/api/admin/matches/${match.id}/refresh`).then(
                        () => undefined,
                      ),
                    )
                  }
                >
                  Refresh
                </button>
              </div>

              {candidates[match.id]?.length ? (
                <div className="mt-4 space-y-2">
                  {candidates[match.id].map((candidate) => (
                    <div
                      className="metal-panel flex flex-col gap-2 rounded-md p-3 md:flex-row md:items-center md:justify-between"
                      key={candidate.fixtureId}
                    >
                      <div className="text-sm">
                        <strong>
                          {candidate.homeTeamName} vs {candidate.awayTeamName}
                        </strong>
                        <p className="text-neutral">
                          {candidate.competitionName} · score{" "}
                          {candidate.score.toFixed(2)}
                        </p>
                      </div>
                      <button
                        className="rounded-md border border-accent bg-accent/20 px-3 py-2 text-sm font-medium text-accent"
                        type="button"
                        onClick={() =>
                          run("Confirmar fixture", async () => {
                            await post(
                              `/api/admin/matches/${match.id}/confirm-fixture`,
                              {
                                fixtureId: candidate.fixtureId,
                              },
                            );
                            window.location.reload();
                          })
                        }
                      >
                        Confirmar
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <label className="mt-3 block text-sm font-medium text-ink">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-line bg-[#090f18] px-3 py-2 text-sm text-ink outline-none placeholder:text-neutral/60 focus:border-accent"
        name={name}
        type={type}
        defaultValue={defaultValue}
      />
    </label>
  );
}
