import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const [pageUrl, pattern] = process.argv.slice(2);

if (pageUrl === "--self-test") {
  assert(
    matchesEndpoint(
      "https://example.com/123/single-pre-event.json?token=abc",
      "single-pre-event.json",
    ),
  );

  assert(
    !matchesEndpoint(
      "https://example.com/statistics.json",
      "single-pre-event.json",
    ),
  );

  console.log("✅ self-test passed");
  process.exit(0);
}

if (!pageUrl || !pattern) {
  throw new Error(
    "Uso: pnpm tsx scripts/find-network-endpoint.ts <page-url> <pattern>",
  );
}

new URL(pageUrl);

const virtualDisplay = process.env.VIRTUAL_DISPLAY === "1";

const profileDirectory = process.env.PROFILE_DIR ?? ".cache/network-profile";

const context = await chromium.launchPersistentContext(profileDirectory, {
  // Stake rechaza HeadlessChrome.
  // Chromium normal se ejecuta dentro de la pantalla virtual.
  headless: false,

  // Evita que Chromium use la sesión Wayland real.
  args: virtualDisplay ? ["--ozone-platform=x11"] : [],
});

const page = context.pages()[0] ?? (await context.newPage());

try {
  // Las expresiones de Promise.all se evalúan de izquierda a derecha:
  // el listener queda registrado antes de iniciar la navegación.
  const [endpointResponse] = await Promise.all([
    page.waitForResponse(
      (response) => {
        const type = response.request().resourceType();

        return (
          (type === "fetch" || type === "xhr") &&
          response.status() >= 200 &&
          response.status() < 300 &&
          matchesEndpoint(response.url(), pattern)
        );
      },
      {
        timeout: 120_000,
      },
    ),

    page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
    }),
  ]);

  console.log("\n✅ Endpoint encontrado:");
  console.log(endpointResponse.url());
} finally {
  await context.close();
}

function matchesEndpoint(url: string, pattern: string): boolean {
  return url.includes(pattern);
}
