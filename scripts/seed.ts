import { getServices } from "../src/server/runtime";

process.env.DEMO_MODE = process.env.DEMO_MODE ?? "true";

const services = await getServices();
const matches = await services.store.listMatches();

console.log(
  JSON.stringify(
    {
      ok: true,
      matches: matches.map((match) => ({
        slug: match.slug,
        published: match.published,
      })),
    },
    null,
    2,
  ),
);
