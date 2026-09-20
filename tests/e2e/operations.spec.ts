import { expect, test } from "@playwright/test";

/**
 * Operations gate flow (handoff §3.8): login -> import check-in + check-out
 * -> board shows correct statuses -> edit a cell -> KPI updates.
 *
 * Requires a running dev server backed by a real Supabase project (local or
 * hosted) with the migrations applied and a seeded reception/owner user.
 * Point these at it before running `npm run test:e2e`:
 *
 *   E2E_TEST_EMAIL=<seeded user email>
 *   E2E_TEST_PASSWORD=<seeded user password>
 *
 * Skipped (not failed) when these are absent, since there is no live
 * Supabase backend available in every environment this suite runs in.
 *
 * CSV fixture data below follows the locked contract (docs/csv-import.md):
 * real header names, DD-MM-YYYY dates, LoS instead of an explicit second date.
 */

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

function todayDash(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

function csvFile(name: string, content: string) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(content, "utf-8") };
}

test.skip(!EMAIL || !PASSWORD, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD are not set; no live Supabase backend to test against.");

test("room board reflects an import and manual edits", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/correo|email/i).fill(EMAIL!);
  await page.getByLabel(/contraseña|password/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /iniciar sesión|sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const checkInCsv = [
    "Reservation Number,Guest Name,Check In,LoS,Room Number,Adults / Children / Infants,Outstanding Balance,Total Amount,Notes",
    `E2E-IN-1,E2E Test Guest,${todayDash(0)},2,Room 5,2 / 0 / 0,$50.00,$120.00,`
  ].join("\n");
  const checkOutCsv = [
    "Reservation Number,Guest Name,Check Out,LoS,Room Number,Adults / Children / Infants,Outstanding Balance,Total Amount,Notes",
    `E2E-OUT-1,E2E Departing Guest,${todayDash(0)},1,Room 6,1 / 0 / 0,$0,$80.00,`
  ].join("\n");

  await page.getByRole("button", { name: /importar check-ins|import check-ins/i }).click();
  await page.locator('input[type="file"]').first().setInputFiles(csvFile("checkins.csv", checkInCsv));
  await page.getByRole("button", { name: /guardar importación|save import/i }).click();
  await expect(page.getByText(/importación se guardó|import saved/i)).toBeVisible();

  await page.getByRole("button", { name: /importar check-outs|import check-outs/i }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles(csvFile("checkouts.csv", checkOutCsv));
  await page.getByRole("button", { name: /guardar importación|save import/i }).click();

  await page.goto("/operations");
  const roomFiveRow = page.locator("tr", { hasText: "5" }).first();
  await expect(roomFiveRow.getByText(/llegada/i)).toBeVisible();
  await expect(roomFiveRow.getByText("E2E Test Guest")).toBeVisible();

  const roomSixRow = page.locator("tr", { hasText: "6" }).first();
  await expect(roomSixRow.getByText(/disponible/i)).toBeVisible();

  await roomFiveRow.getByLabel(/edit|editar/i).click();
  await page.getByLabel(/plate|placa/i).fill("CR-1234");
  await page.getByRole("button", { name: /save|guardar/i }).click();
  await expect(page.getByText("CR-1234")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText(/check-ins|check-ins de hoy/i)).toBeVisible();
});
