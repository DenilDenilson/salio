import type { APIRoute } from "astro";
import { getServices } from "../../../server/runtime";

export const GET: APIRoute = async () => {
  const { store } = await getServices();
  const match = await store.getPublishedCurrentMatch();
  return new Response(JSON.stringify({ match }), {
    status: match ? 200 : 404,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, max-age=5",
    },
  });
};
