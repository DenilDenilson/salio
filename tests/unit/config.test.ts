import { afterEach, describe, expect, it } from "vitest";
import { getConfig } from "../../src/server/config";

const originalStakeApiAllowedHosts = process.env.STAKE_API_ALLOWED_HOSTS;

afterEach(() => {
  if (originalStakeApiAllowedHosts === undefined) {
    delete process.env.STAKE_API_ALLOWED_HOSTS;
    return;
  }
  process.env.STAKE_API_ALLOWED_HOSTS = originalStakeApiAllowedHosts;
});

describe("config", () => {
  it("parses the Stake API host allowlist", () => {
    process.env.STAKE_API_ALLOWED_HOSTS =
      ".websbkt.com,pre-143o-sp.websbkt.com";

    expect(getConfig().stakeApiAllowedHosts).toEqual([
      ".websbkt.com",
      "pre-143o-sp.websbkt.com",
    ]);
  });
});
