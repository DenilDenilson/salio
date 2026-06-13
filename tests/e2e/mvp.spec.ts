import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("admin creates, imports, maps, freezes and publishes a match", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Admin flow runs once; mobile has a dedicated layout smoke test.",
  );

  const slug = `e2e-${Date.now()}`;
  await page.goto("/admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(
    page.getByRole("heading", { name: "Administración" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(250);

  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Título").fill("Canadá vs Bosnia E2E");
  await expect(page.getByLabel("Slug")).toHaveValue(slug);
  await page.getByRole("button", { name: "Crear" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("article").filter({ hasText: slug })).toBeVisible();

  let article = page.locator("article").filter({ hasText: slug });
  await article.getByRole("button", { name: "Importar Stake" }).click();
  await page.waitForLoadState("networkidle");
  article = page.locator("article").filter({ hasText: slug });
  await article.getByRole("button", { name: "Buscar fixture" }).click();
  await expect(
    article.getByRole("button", { name: "Confirmar" }),
  ).toBeVisible();
  await article.getByRole("button", { name: "Confirmar" }).click();
  await page.waitForLoadState("networkidle");
  article = page.locator("article").filter({ hasText: slug });
  await article.getByRole("button", { name: "Congelar" }).click();
  await page.waitForLoadState("networkidle");
  article = page.locator("article").filter({ hasText: slug });
  await article.getByRole("button", { name: "Publicar" }).click();
  await page.waitForLoadState("networkidle");

  article = page.locator("article").filter({ hasText: slug });
  await article.getByRole("link", { name: "Ver página" }).click();
  await page.waitForURL(`/partidos/${slug}`);
  await expect(
    page.getByRole("heading", { name: /Canadá vs Bosnia/ }),
  ).toBeVisible();
  await expect(page.getByText("Cuotas congeladas")).toBeVisible();
});

test("public match board polls, updates statuses and keeps accessible state text", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Sitio informativo no afiliado a Stake"),
  ).toBeVisible();
  await expect(page.getByText("1 - 1")).toBeVisible();
  await expect(page.getByText("Acertada").first()).toBeVisible();
  await expect(page.getByText("Perdida").first()).toBeVisible();
  await expect(page.getByText("Minuto").first()).toBeVisible();

  await page.getByRole("button", { name: "Goles" }).click();
  await expect(page.getByText("Total de goles", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Perdidas" }).click();
  await expect(page.getByText("Perdida").first()).toBeVisible();
  await page.getByPlaceholder("Selección").fill("Más de 2.5");
  await expect(
    page.getByText("Más de 2.5", { exact: true }).first(),
  ).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) => violation.impact === "critical"),
  ).toEqual([]);
});

test("mobile viewport does not overflow", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "Mobile smoke runs only in the mobile project.",
  );
  await page.goto("/");
  await expect(
    page.getByText("Sitio informativo no afiliado a Stake"),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
