import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { MatchSnapshotSchema } from "./server/snapshots/schema";

const matches = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/matches" }),
  schema: MatchSnapshotSchema,
});

export const collections = { matches };
