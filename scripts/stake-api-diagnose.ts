import { getConfig } from "../src/server/config";
import {
  curlStakeApi,
  fetchStakeApi,
} from "../src/server/importers/stake/apiClient";
import {
  redactStakeApiUrl,
  requireStakeEventId,
  validateStakeApiUrl,
} from "../src/server/importers/stake/endpoint";
import { parseCliArgs, requireStringArg } from "../src/server/snapshots/cli";

const args = parseCliArgs(process.argv.slice(2));
const usage =
  'Uso: pnpm stake:diagnose -- --stake-url="https://stake.pe/.../event/21798330" --stake-api-url="https://.../single-pre-event.json?hidenseek=..."';

try {
  const config = getConfig();
  const stakeUrl = requireStringArg(args, "stake-url");
  const stakeApiUrl = requireStringArg(args, "stake-api-url");
  const eventId = requireStakeEventId(stakeUrl);
  validateStakeApiUrl(stakeApiUrl, {
    expectedEventId: eventId,
    allowedHosts: config.stakeApiAllowedHosts,
  });
  const timeoutMs = config.STAKE_API_TIMEOUT_MS;
  const maxResponseBytes = 2_000_000;

  const [nodeFetch, curl] = await Promise.all([
    diagnose("node-fetch", () =>
      fetchStakeApi({ apiUrl: stakeApiUrl, timeoutMs, maxResponseBytes }),
    ),
    diagnose("curl", () =>
      curlStakeApi({ apiUrl: stakeApiUrl, timeoutMs, maxResponseBytes }),
    ),
  ]);

  console.log(JSON.stringify([nodeFetch, curl], null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage);
  process.exit(1);
}

async function diagnose(
  transport: "node-fetch" | "curl",
  run: () => Promise<{
    status: number;
    contentType: string;
    responseBytes: number;
  }>,
): Promise<{
  transport: "node-fetch" | "curl";
  status: number | null;
  contentType: string;
  responseBytes: number;
  url: string;
}> {
  try {
    const result = await run();
    return {
      transport,
      status: result.status,
      contentType: result.contentType,
      responseBytes: result.responseBytes,
      url: redactStakeApiUrl(requireStringArg(args, "stake-api-url")),
    };
  } catch {
    return {
      transport,
      status: null,
      contentType: "",
      responseBytes: 0,
      url: redactStakeApiUrl(requireStringArg(args, "stake-api-url")),
    };
  }
}
