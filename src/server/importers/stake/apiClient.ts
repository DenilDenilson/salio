import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";
import { AppError } from "../../errors";
import { redactStakeApiUrl, validateStakeApiUrl } from "./endpoint";

const DEFAULT_RETRIES = 1;
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;
export const STAKE_API_REQUEST_HEADERS = {
  Referer: "https://stake.pe/",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Brave";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Linux"',
} as const;

const CURL_STATUS_SEPARATOR = "\n__STAKE_HTTP_STATUS__:";

export interface StakeApiFetchResult {
  rawText: string;
  fetchedAt: string;
  apiUrlSanitized: string;
  payloadSha256: string;
  rawArtifactPath?: string;
}

export interface StakeApiClientOptions {
  allowedHosts: string[];
  timeoutMs: number;
  fetchFn?: typeof fetch;
  spawnFn?: typeof spawn;
  retries?: number;
  maxResponseBytes?: number;
  headers?: Record<string, string>;
  saveRawApiPath?: string | null;
  transport?: "curl" | "fetch";
}

export interface StakeApiTransportResult {
  rawText: string;
  status: number;
  contentType: string;
  responseBytes: number;
}

export class StakeApiClient {
  constructor(private readonly options: StakeApiClientOptions) {}

  async fetchEvent(input: {
    apiUrl: string;
    expectedEventId: string;
  }): Promise<StakeApiFetchResult> {
    validateStakeApiUrl(input.apiUrl, {
      expectedEventId: input.expectedEventId,
      allowedHosts: this.options.allowedHosts,
    });
    const retries = this.options.retries ?? DEFAULT_RETRIES;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await this.requestOnce(input.apiUrl);
        const rawArtifactPath = this.options.saveRawApiPath
          ? await writeRawApiPayload(
              this.options.saveRawApiPath,
              result.rawText,
            )
          : undefined;
        return { ...result, rawArtifactPath };
      } catch (error) {
        lastError = error;
        if (
          attempt < retries &&
          error instanceof AppError &&
          isRetryableStakeApiError(error)
        ) {
          await delay(150 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }

    throw toStakeApiTimeout(lastError);
  }

  private async requestOnce(apiUrl: string): Promise<StakeApiFetchResult> {
    try {
      const result =
        this.options.transport === "fetch" || this.options.fetchFn
          ? await fetchStakeApi({
              apiUrl,
              timeoutMs: this.options.timeoutMs,
              maxResponseBytes:
                this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
              fetchFn: this.options.fetchFn,
              headers: this.options.headers,
            })
          : await curlStakeApi({
              apiUrl,
              timeoutMs: this.options.timeoutMs,
              maxResponseBytes:
                this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
              spawnFn: this.options.spawnFn,
              headers: this.options.headers,
            });

      if (result.status < 200 || result.status >= 300) {
        const message = httpErrorMessage(result.status, apiUrl);
        throw new AppError("STAKE_API_HTTP_ERROR", message, result.status);
      }
      if (!result.contentType.toLowerCase().includes("json")) {
        throw new AppError(
          "STAKE_API_INVALID_CONTENT_TYPE",
          `Stake API returned non-JSON content for ${redactStakeApiUrl(apiUrl)}.`,
        );
      }
      return {
        rawText: result.rawText,
        fetchedAt: new Date().toISOString(),
        apiUrlSanitized: redactStakeApiUrl(apiUrl),
        payloadSha256: sha256(result.rawText),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new AppError(
          "STAKE_API_TIMEOUT",
          `Stake API request timed out for ${redactStakeApiUrl(apiUrl)}.`,
          504,
        );
      }
      throw toStakeApiTimeout(error);
    }
  }
}

function isRetryableStakeApiError(error: AppError): boolean {
  if (error.code === "STAKE_API_TIMEOUT") {
    return true;
  }
  if (error.code !== "STAKE_API_HTTP_ERROR") {
    return false;
  }
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

export async function writeRawApiPayload(
  path: string,
  rawText: string,
): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, rawText, "utf8");
    if (sha256(await readFile(tempPath, "utf8")) !== sha256(rawText)) {
      throw new AppError(
        "STAKE_API_INVALID_PAYLOAD",
        "Could not verify written Stake API evidence.",
      );
    }
    await rename(tempPath, path);
    return path;
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function fetchStakeApi(input: {
  apiUrl: string;
  timeoutMs: number;
  maxResponseBytes?: number;
  fetchFn?: typeof fetch;
  headers?: Record<string, string>;
}): Promise<StakeApiTransportResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await (input.fetchFn ?? fetch)(input.apiUrl, {
      headers: requestHeaders(input.headers),
      signal: controller.signal,
    });
    const rawText = await readTextWithLimit(
      response,
      input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    );
    return {
      rawText,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      responseBytes: new TextEncoder().encode(rawText).byteLength,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function curlStakeApi(input: {
  apiUrl: string;
  timeoutMs: number;
  maxResponseBytes?: number;
  spawnFn?: typeof spawn;
  headers?: Record<string, string>;
}): Promise<StakeApiTransportResult> {
  const headers = requestHeaders(input.headers);
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--max-time",
    String(Math.max(1, Math.ceil(input.timeoutMs / 1000))),
    "--write-out",
    `${CURL_STATUS_SEPARATOR}%{http_code}\\n__STAKE_CONTENT_TYPE__:%{content_type}`,
    input.apiUrl,
  ];
  for (const [key, value] of Object.entries(headers).reverse()) {
    args.splice(args.length - 1, 0, "--header", `${key}: ${value}`);
  }

  const child = (input.spawnFn ?? spawn)("curl", args, {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const maxBytes = input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
  }, input.timeoutMs);

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.byteLength;
    if (stdoutBytes > maxBytes + 512) {
      child.kill("SIGTERM");
      return;
    }
    stdoutChunks.push(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBytes += chunk.byteLength;
    if (stderrBytes <= 32_768) {
      stderrChunks.push(chunk);
    }
  });

  const [code, signal] = (await once(child, "close")) as [
    number | null,
    NodeJS.Signals | null,
  ];
  clearTimeout(timeout);

  if (stdoutBytes > maxBytes + 512) {
    throw new AppError(
      "STAKE_API_RESPONSE_TOO_LARGE",
      "Stake API response is too large.",
    );
  }
  if (signal) {
    throw new AppError(
      "STAKE_API_TIMEOUT",
      `Stake API curl request timed out for ${redactStakeApiUrl(input.apiUrl)}.`,
      504,
    );
  }
  if (code !== 0) {
    const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
    throw new AppError(
      "STAKE_API_TIMEOUT",
      stderr || `curl exited with code ${code ?? "unknown"}.`,
      503,
    );
  }

  const output = Buffer.concat(stdoutChunks).toString("utf8");
  const parsed = parseCurlOutput(output);
  const responseBytes = new TextEncoder().encode(parsed.rawText).byteLength;
  if (responseBytes > maxBytes) {
    throw new AppError(
      "STAKE_API_RESPONSE_TOO_LARGE",
      "Stake API response is too large.",
    );
  }
  return {
    rawText: parsed.rawText,
    status: parsed.status,
    contentType: parsed.contentType,
    responseBytes,
  };
}

export function requestHeaders(
  overrides?: Record<string, string>,
): Record<string, string> {
  return { ...STAKE_API_REQUEST_HEADERS, ...overrides };
}

async function readTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new AppError(
        "STAKE_API_RESPONSE_TOO_LARGE",
        "Stake API response is too large.",
      );
    }
    return text;
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      throw new AppError(
        "STAKE_API_RESPONSE_TOO_LARGE",
        "Stake API response is too large.",
      );
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function parseCurlOutput(output: string): {
  rawText: string;
  status: number;
  contentType: string;
} {
  const statusIndex = output.lastIndexOf(CURL_STATUS_SEPARATOR);
  if (statusIndex < 0) {
    throw new AppError(
      "STAKE_API_INVALID_PAYLOAD",
      "curl response did not include HTTP status metadata.",
    );
  }
  const rawText = output.slice(0, statusIndex);
  const metadata = output.slice(statusIndex + CURL_STATUS_SEPARATOR.length);
  const [statusText = "", contentTypeLine = ""] = metadata.split("\n");
  const status = Number(statusText.trim());
  if (!Number.isInteger(status)) {
    throw new AppError(
      "STAKE_API_INVALID_PAYLOAD",
      "curl response included invalid HTTP status metadata.",
    );
  }
  return {
    rawText,
    status,
    contentType: contentTypeLine.replace(/^__STAKE_CONTENT_TYPE__:/, "").trim(),
  };
}

function toStakeApiTimeout(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(
    "STAKE_API_TIMEOUT",
    error instanceof Error ? error.message : "Stake API request failed.",
    503,
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function httpErrorMessage(status: number, apiUrl: string): string {
  const url = redactStakeApiUrl(apiUrl);
  switch (status) {
    case 401:
      return `Stake API rejected credentials with HTTP 401 for ${url}.`;
    case 403:
      return `Stake API denied access with HTTP 403 for ${url}.`;
    case 404:
      return `Stake API event was not found with HTTP 404 for ${url}.`;
    case 406:
      return `Stake API returned HTTP 406 for ${url}.`;
    case 429:
      return `Stake API rate limited the request with HTTP 429 for ${url}.`;
    default:
      if (status >= 500) {
        return `Stake API returned server error HTTP ${status} for ${url}.`;
      }
      return `Stake API returned HTTP ${status} for ${url}.`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
