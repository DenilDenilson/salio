import { describe, expect, it } from "vitest";
import {
  competitionLeagueSlugForName,
  normalizeProviderTeamName,
  providerTeamNamesMatch,
} from "../../src/server/providers/teamNormalization";

describe("provider team normalization", () => {
  it("matches Spanish snapshot names against ESPN display names", () => {
    expect(providerTeamNamesMatch("Brasil", "Brazil")).toBe(true);
    expect(providerTeamNamesMatch("Marruecos", "Morocco")).toBe(true);
    expect(providerTeamNamesMatch("Catar", "Qatar")).toBe(true);
    expect(providerTeamNamesMatch("Suiza", "Switzerland")).toBe(true);
    expect(providerTeamNamesMatch("Turquía", "Türkiye")).toBe(true);
  });

  it("normalizes provider aliases to a shared canonical name", () => {
    expect(normalizeProviderTeamName("Turquía")).toBe("turkey");
    expect(normalizeProviderTeamName("Türkiye")).toBe("turkey");
    expect(normalizeProviderTeamName("Países Bajos")).toBe("netherlands");
  });

  it("maps World Cup competition labels to the ESPN league slug", () => {
    expect(competitionLeagueSlugForName("Mundial 2026")).toBe("fifa.world");
    expect(competitionLeagueSlugForName("FIFA World Cup")).toBe("fifa.world");
    expect(competitionLeagueSlugForName("Amistoso internacional")).toBeNull();
  });
});
