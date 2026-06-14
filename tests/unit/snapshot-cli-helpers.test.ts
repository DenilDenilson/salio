import { describe, expect, it } from "vitest";
import {
  booleanFlag,
  optionalNumberArg,
  optionalStringArg,
  parseCliArgs,
  parseMatchTitleTeams,
  requireStringArg,
} from "../../src/server/snapshots/cli";

describe("snapshot CLI helpers", () => {
  it("parses equals args, value args and boolean flags", () => {
    const args = parseCliArgs([
      "--",
      "--slug=canada-vs-bosnia",
      "--event-id",
      "760419",
      "ignored-positional",
      "--empty",
      "",
      "--demo-provider",
    ]);

    expect(requireStringArg(args, "slug")).toBe("canada-vs-bosnia");
    expect(optionalStringArg(args, "event-id")).toBe("760419");
    expect(booleanFlag(args, "demo-provider")).toBe(true);
    expect(optionalStringArg(args, "empty")).toBeNull();
    expect(optionalStringArg(args, "missing")).toBeNull();
  });

  it("validates required strings, integers and truthy boolean aliases", () => {
    expect(() => requireStringArg({}, "slug")).toThrow(
      "Missing required argument --slug.",
    );
    expect(() => optionalNumberArg({ limit: "99.5" }, "limit")).toThrow(
      "Argument --limit must be an integer.",
    );
    expect(() => optionalNumberArg({ limit: "abc" }, "limit")).toThrow(
      "Argument --limit must be an integer.",
    );
    expect(() => optionalNumberArg({ limit: "-1" }, "limit")).toThrow(
      "Argument --limit must be a positive integer.",
    );
    expect(booleanFlag({ "demo-provider": "true" }, "demo-provider")).toBe(
      true,
    );
    expect(booleanFlag({ "demo-provider": "1" }, "demo-provider")).toBe(true);
    expect(booleanFlag({ "demo-provider": "false" }, "demo-provider")).toBe(
      false,
    );
  });

  it("derives teams from visible match titles", () => {
    expect(parseMatchTitleTeams("Brasil vs Marruecos")).toEqual({
      home: "Brasil",
      away: "Marruecos",
    });
    expect(parseMatchTitleTeams("Países Bajos vs. Japón")).toEqual({
      home: "Países Bajos",
      away: "Japón",
    });
    expect(parseMatchTitleTeams("Brasil contra Marruecos")).toBeNull();
  });
});
