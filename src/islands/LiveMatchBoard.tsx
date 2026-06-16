import { useMemo, useState } from "react";
import {
  MarketType,
  SelectionStatus,
  type MarketState,
  type NormalizedSelection,
  type StateResponse,
} from "../domain/model";
import { selectionDisplayName } from "../domain/markets/display";

const stateLabels: Record<
  SelectionStatus,
  { icon: string; label: string; className: string }
> = {
  pending: {
    icon: "○",
    label: "Pendiente",
    className: "status-pill",
  },
  won: {
    icon: "✓",
    label: "Acertada",
    className: "status-pill status-won",
  },
  lost: {
    icon: "✕",
    label: "Perdida",
    className: "status-pill status-lost",
  },
  void: {
    icon: "↺",
    label: "Anulada",
    className: "status-pill status-void",
  },
  unsupported: {
    icon: "?",
    label: "Sin evaluación",
    className: "status-pill status-unsupported",
  },
};

const categoryFilters = [
  { id: "all", label: "Todas" },
  {
    id: "result",
    label: "Resultado",
    types: [
      MarketType.MATCH_RESULT,
      MarketType.DOUBLE_CHANCE,
      MarketType.DRAW_NO_BET,
    ],
  },
  {
    id: "goals",
    label: "Goles",
    types: [
      MarketType.TOTAL_GOALS,
      MarketType.BOTH_TEAMS_TO_SCORE,
      MarketType.FIRST_TEAM_TO_SCORE,
    ],
  },
  { id: "cards", label: "Tarjetas", types: [MarketType.TOTAL_YELLOW_CARDS] },
  { id: "corners", label: "Córners", types: [MarketType.TOTAL_CORNERS] },
  {
    id: "players",
    label: "Jugadores",
    types: [MarketType.ANYTIME_GOALSCORER, MarketType.PLAYER_SHOTS_ON_TARGET],
  },
] as const;

const statusFilters = [
  { id: "all", label: "Todas" },
  { id: SelectionStatus.PENDING, label: "Pendientes" },
  { id: SelectionStatus.WON, label: "Acertadas" },
  { id: SelectionStatus.LOST, label: "Perdidas" },
  { id: SelectionStatus.VOID, label: "Anuladas" },
] as const;

interface Props {
  initialState: StateResponse;
}

export default function LiveMatchBoard({ initialState }: Props) {
  const state = initialState;
  const [category, setCategory] =
    useState<(typeof categoryFilters)[number]["id"]>("all");
  const [status, setStatus] =
    useState<(typeof statusFilters)[number]["id"]>("all");
  const [query, setQuery] = useState("");

  const markets = useMemo(() => {
    return state.markets
      .map((market) => filterMarket(market, category, status, query))
      .filter((market): market is MarketState => market !== null);
  }, [state.markets, category, status, query]);

  const counts = useMemo(() => {
    return state.markets
      .flatMap((market) => market.selections)
      .reduce<Record<SelectionStatus, number>>(
        (acc, selection) => {
          acc[selection.status] += 1;
          return acc;
        },
        {
          pending: 0,
          won: 0,
          lost: 0,
          void: 0,
          unsupported: 0,
        },
      );
  }, [state.markets]);

  return (
    <main className="metal-shell">
      <section className="metal-header">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
                Sitio informativo no afiliado a Stake
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">
                {state.match.title}
              </h1>
              <p className="mt-1 text-sm text-neutral">
                {state.match.competitionName ?? "Competición sin nombre"} ·
                Inicio {formatDate(state.match.kickoffAt)}
              </p>
            </div>
            <div
              className="metal-panel rounded-md px-4 py-3"
              aria-live="polite"
            >
              <div className="text-sm font-medium text-neutral">
                {state.match.status}
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="max-w-[8rem] truncate text-base font-semibold">
                  {state.match.homeTeamName}
                </span>
                <span className="text-3xl font-bold tabular-nums text-ink drop-shadow-[0_0_14px_rgba(52,214,255,0.24)]">
                  {state.match.score.home} - {state.match.score.away}
                </span>
                <span className="max-w-[8rem] truncate text-base font-semibold">
                  {state.match.awayTeamName}
                </span>
              </div>
              <div className="mt-1 text-sm text-neutral">
                {state.match.elapsedMinutes
                  ? `${state.match.elapsedMinutes}'`
                  : "Sin minuto"}{" "}
                · Actualizado {formatTime(state.lastUpdatedAt)}
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-[1fr_auto]">
            <div className="metal-panel rounded-md p-3">
              <strong>Cuotas congeladas:</strong>{" "}
              {formatDate(state.odds.capturedAt)} · {state.odds.timezone}
              <p className="mt-1 text-neutral">{state.odds.notice}</p>
            </div>
            {state.stale ? (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 font-medium text-warning">
                Datos stale: mostrando el último estado válido.
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div
              className="flex flex-wrap gap-2"
              aria-label="Filtro de mercado"
            >
              {categoryFilters.map((filter) => (
                <button
                  className={buttonClass(category === filter.id)}
                  key={filter.id}
                  type="button"
                  onClick={() => setCategory(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <label className="metal-panel flex min-w-0 items-center gap-2 rounded-md px-3 py-2">
              <span className="text-sm font-medium text-neutral">Buscar</span>
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-neutral/60"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Selección"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Filtro de estado">
            {statusFilters.map((filter) => (
              <button
                className={buttonClass(status === filter.id)}
                key={filter.id}
                type="button"
                onClick={() => setStatus(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {Object.entries(counts).map(([key, value]) => {
              const stateKey = key as SelectionStatus;
              return (
                <div
                  className={`rounded-md border px-3 py-2 ${stateLabels[stateKey].className}`}
                  key={key}
                >
                  <span aria-hidden="true">{stateLabels[stateKey].icon}</span>{" "}
                  {stateLabels[stateKey].label}: <strong>{value}</strong>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="space-y-3">
          {markets.map((market) => (
            <details
              className="metal-card overflow-hidden rounded-md"
              key={market.id}
              open
            >
              <summary className="cursor-pointer border-b border-line/80 px-4 py-3 text-base font-semibold text-ink">
                {market.displayName}
                {!market.supported ? (
                  <span className="ml-2 text-sm font-medium text-neutral">
                    Sin evaluación
                  </span>
                ) : null}
              </summary>
              <div className="divide-y divide-line/80">
                {market.selections.map((selection) => (
                  <SelectionRow key={selection.id} selection={selection} />
                ))}
              </div>
            </details>
          ))}
          {markets.length === 0 ? (
            <div className="metal-card rounded-md p-6 text-center text-neutral">
              No hay selecciones para los filtros elegidos.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SelectionRow({ selection }: { selection: NormalizedSelection }) {
  const label = stateLabels[selection.status];
  const displayName = selectionDisplayName(selection);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 transition hover:bg-accent/5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-medium ${label.className}`}
          >
            <span aria-hidden="true">{label.icon}</span>
            <span>{label.label}</span>
          </span>
          <span className="min-w-0 break-words font-medium text-ink">
            {displayName}
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral">
          {selection.resolvedMinute
            ? `Minuto ${selection.resolvedMinute}: `
            : ""}
          {selection.resolutionReason ?? "Pendiente de resolución deportiva."}
        </p>
      </div>
      <div className="metal-panel self-start rounded-md px-3 py-2 text-right font-semibold tabular-nums text-ink">
        {selection.oddDecimal.toFixed(2)}
      </div>
    </div>
  );
}

function filterMarket(
  market: MarketState,
  category: (typeof categoryFilters)[number]["id"],
  status: (typeof statusFilters)[number]["id"],
  query: string,
): MarketState | null {
  const categoryFilter = categoryFilters.find(
    (filter) => filter.id === category,
  );
  const categoryTypes: readonly MarketType[] | null =
    categoryFilter && "types" in categoryFilter ? categoryFilter.types : null;
  if (categoryTypes && !categoryTypes.includes(market.marketType)) {
    return null;
  }
  const normalizedQuery = query.trim().toLowerCase();
  const selections = market.selections.filter((selection) => {
    const displayName = selectionDisplayName(selection);
    const statusMatch = status === "all" || selection.status === status;
    const queryMatch =
      normalizedQuery.length === 0 ||
      displayName.toLowerCase().includes(normalizedQuery);
    return statusMatch && queryMatch;
  });
  return selections.length > 0 ? { ...market, selections } : null;
}

function buttonClass(active: boolean): string {
  return `rounded-md px-3 py-2 text-sm font-medium ${
    active ? "ui-button ui-button-active" : "ui-button"
  }`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
