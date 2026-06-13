import { afterEach, describe, expect, it } from "vitest";
import { getConfig } from "../../src/server/config";

const originalStakeImportHeadless = process.env.STAKE_IMPORT_HEADLESS;

afterEach(() => {
  if (originalStakeImportHeadless === undefined) {
    delete process.env.STAKE_IMPORT_HEADLESS;
    return;
  }
  process.env.STAKE_IMPORT_HEADLESS = originalStakeImportHeadless;
});

describe("config", () => {
  it("parses the Stake headless browser flag", () => {
    process.env.STAKE_IMPORT_HEADLESS = "false";
    expect(getConfig().STAKE_IMPORT_HEADLESS).toBe(false);

    process.env.STAKE_IMPORT_HEADLESS = "true";
    expect(getConfig().STAKE_IMPORT_HEADLESS).toBe(true);
  });
});
