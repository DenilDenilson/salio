import { getServices } from "../src/server/runtime";
import { stakeFixturePath } from "../src/server/demo/seed";
import { importStakeBySlug } from "../src/server/services/admin";

const args = parseArgs(process.argv.slice(2));

if (!args.url || !args.slug) {
  console.error(
    'Uso: pnpm stake:import --url="https://stake.pe/..." --slug="estados-unidos-vs-paraguay"',
  );
  process.exit(1);
}

const services = await getServices();
const snapshot = await importStakeBySlug({
  store: services.store,
  importer: services.importer,
  config: services.config,
  slug: args.slug,
  url: args.url,
  fixtureHtmlPath: services.config.DEMO_MODE ? stakeFixturePath : undefined,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      snapshotId: snapshot.id,
      markets: snapshot.markets.length,
      selections: snapshot.markets.reduce(
        (total, market) => total + market.selections.length,
        0,
      ),
    },
    null,
    2,
  ),
);

function parseArgs(values: string[]): { url?: string; slug?: string } {
  return Object.fromEntries(
    values
      .filter((value) => value.startsWith("--"))
      .map((value) => {
        const [key, ...rest] = value.slice(2).split("=");
        return [key, rest.join("=")];
      }),
  );
}
