import { getServices } from "../src/server/runtime";
import { importStakeBySlug } from "../src/server/services/admin";

const args = parseArgs(process.argv.slice(2));

if (!args.url || !args.slug || !args["stake-api-url"]) {
  console.error(
    'Uso: pnpm stake:import --url="https://stake.pe/..." --stake-api-url="https://.../single-pre-event.json?hidenseek=..." --slug="estados-unidos-vs-paraguay"',
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
  stakeApiUrl: args["stake-api-url"],
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

function parseArgs(values: string[]): {
  url?: string;
  slug?: string;
  "stake-api-url"?: string;
} {
  return Object.fromEntries(
    values
      .filter((value) => value.startsWith("--"))
      .map((value) => {
        const [key, ...rest] = value.slice(2).split("=");
        return [key, rest.join("=")];
      }),
  );
}
