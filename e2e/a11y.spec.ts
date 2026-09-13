import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Zero axe violations on every screen a learner uses, including mid-review. */

async function analyse(page: Page) {
  // Let entrance animations finish so axe measures the settled colours.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test("decks, deck, review, stats, settings and account have no axe violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible({ timeout: 60_000 });
  await analyse(page);

  await page.getByLabel("Deck name").fill("Axe deck");
  await page.getByRole("button", { name: "Create deck" }).click();
  await expect(page.getByRole("heading", { name: "Axe deck" })).toBeVisible();
  await page.getByLabel("Front").first().fill("der Baum");
  await page.getByLabel("Back").first().fill("the tree");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("status")).toContainText("Added");
  await analyse(page);

  await page.getByRole("link", { name: /Review 1 card/ }).click();
  await expect(page.getByText("der Baum", { exact: true })).toBeVisible();
  await analyse(page);
  await page.getByRole("button", { name: /Show answer/ }).click();
  await expect(page.getByText("the tree", { exact: true })).toBeVisible();
  await analyse(page);
  await page.getByRole("button", { name: /Remembered/ }).click();
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  await analyse(page);

  for (const path of ["/stats", "/settings", "/account", "/account/recover"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await analyse(page);
  }
});
