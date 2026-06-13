import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home shows the static historical match list", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Historical listing smoke runs once; mobile has a dedicated layout test.",
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Histórico de partidos" }),
  ).toBeVisible();
  const matchLink = page.getByRole("link", {
    name: /Canadá vs Bosnia y Herzegovina/,
  });
  await expect(matchLink).toBeVisible();
  await expect(matchLink.getByText("Finalizado")).toBeVisible();
  await expect(matchLink.getByText("1 - 1")).toBeVisible();

  await matchLink.click();
  await page.waitForURL("**/partidos/canada-vs-bosnia");
  await expect(
    page.getByRole("heading", { name: "Canadá vs Bosnia y Herzegovina" }),
  ).toBeVisible();
});

test("public snapshot board renders frozen odds, resolved statuses and filters", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Snapshot board interaction and axe scan run once.",
  );

  await page.goto("/partidos/canada-vs-bosnia");
  await expect(
    page.getByText("Sitio informativo no afiliado a Stake"),
  ).toBeVisible();
  await expect(page.getByText("1 - 1")).toBeVisible();
  await expect(
    page.getByText("Cuotas congeladas:", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Acertada").first()).toBeVisible();
  await expect(page.getByText("Perdida").first()).toBeVisible();
  await expect(page.getByText("Anulada").first()).toBeVisible();

  await page.getByRole("button", { name: "Goles" }).click();
  await expect(page.getByText("Total de goles", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Selección").fill("Más de 2.5");
  await expect(
    page.getByText("Más de 2.5", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Perdida").first()).toBeVisible();

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
    page.getByRole("heading", { name: "Histórico de partidos" }),
  ).toBeVisible();
  const homeOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(homeOverflow).toBe(false);

  await page.goto("/partidos/canada-vs-bosnia");
  await expect(page.getByText("1 - 1")).toBeVisible();
  const matchOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(matchOverflow).toBe(false);
});
