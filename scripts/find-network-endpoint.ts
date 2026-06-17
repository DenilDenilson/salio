import assert from "node:assert/strict"
import { chromium } from "playwright"

const [pageUrl, pattern] = process.argv.slice(2)

if (pageUrl === "--self-test") {
    assert(matchesEndpoint(
        "https://example.com/123/single-pre-event.json?token=abc",
        "single-pre-event.json"
    ))

    assert(!matchesEndpoint(
        "https://example.com/statistics.json",
        "single-pre-event.json"
    ))

    console.log("✅ self-test passed")
    process.exit(0)
}

if (!pageUrl || !pattern) {
    throw new Error(
        "Uso: pnpm tsx scripts/find-network-endpoint.ts <page-url> <pattern>"
    )
}

new URL(pageUrl)

const context = await chromium.launchPersistentContext(
    ".cache/network-profile",
    {
        headless: false,
    }
)

// ponytail: un único perfil evita gestionar sesiones;
// para ejecuciones paralelas usa un directorio distinto por proceso.
const page = context.pages()[0] ?? await context.newPage()

const endpoint = await new Promise<string>(async (resolve, reject) => {
    const timeout = setTimeout(
        () => reject(new Error(`No se encontró "${pattern}" en 120 segundos`)),
        120_000
    )

    context.on("response", (response) => {
        const request = response.request()
        const type = request.resourceType()

        if (type !== "fetch" && type !== "xhr") return

        const url = response.url()

        // console.log(`${response.status()} ${type} ${url}`)

        if (
            response.status() >= 200 &&
            response.status() < 300 &&
            matchesEndpoint(url, pattern)
        ) {
            clearTimeout(timeout)
            resolve(url)
        }
    })

    try {
        await page.goto(pageUrl, {
            waitUntil: "domcontentloaded",
        })
    } catch (error) {
        clearTimeout(timeout)
        reject(error)
    }
})

console.log("\n✅ Endpoint encontrado:")
console.log(endpoint)

await context.close()

function matchesEndpoint(url: string, pattern: string): boolean {
    return url.includes(pattern)
}
