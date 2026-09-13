import { expect, test, type Page } from "@playwright/test";

const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

async function landAsGuest(page: Page) {
  await page.goto("/");
  // The first request to the auth route compiles it in dev, so allow extra time here.
  await expect(page.getByRole("heading", { name: "Decks" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Keep my progress" })).toBeVisible();
}

async function createDeckWithCard(page: Page, deckName: string) {
  await page.getByLabel("Deck name").fill(deckName);
  await page.getByRole("button", { name: "Create deck" }).click();
  await expect(page.getByRole("heading", { name: deckName })).toBeVisible();
  await page.getByLabel("Front").first().fill("der Apfel");
  await page.getByLabel("Back").first().fill("the apple");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("status")).toContainText("Added");
}

async function reviewOneCard(page: Page) {
  await page.getByRole("link", { name: /Review 1 card/ }).click();
  await expect(page.getByText("der Apfel", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Show answer/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("the apple", { exact: true })).toBeVisible();
  await page.keyboard.press("2");
  await expect(page.getByRole("heading", { name: "Session done" })).toBeVisible();
  // The grade saved through the TypeScript fallback and produced a due date.
  await expect(page.getByText(/back tomorrow/)).toBeVisible();
}

async function signOut(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Keep my progress" })).toBeVisible();
}

async function signUp(page: Page, username: string, password: string): Promise<string> {
  await page.getByRole("link", { name: "Keep my progress" }).click();
  await page.getByLabel("Username").first().fill(username);
  await page.getByLabel("Password").first().fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Save this recovery code" })).toBeVisible();
  const code = (await page.locator("p.font-mono").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
  await page.getByRole("button", { name: "I saved it" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
  return code;
}

test("guest reviews a card, keeps it with a username, and finds it after signing in again", async ({ page }) => {
  const username = `e2e_${stamp()}`;
  const password = "correct horse battery";
  const deckName = `Smoke ${stamp()}`;

  await landAsGuest(page);
  await createDeckWithCard(page, deckName);
  await reviewOneCard(page);
  await signUp(page, username, password);

  await signOut(page);

  await page.goto("/account");
  const signInForm = page.locator("form").filter({ hasText: "Sign in" });
  await signInForm.getByLabel("Username").fill(username);
  await signInForm.getByLabel("Password").fill(password);
  await signInForm.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(deckName) })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(deckName) }).click();
  await expect(page.getByText("der Apfel", { exact: true })).toBeVisible();
  await expect(page.getByText(/due tomorrow/)).toBeVisible();
});

test("recovery code signs in and sets a new password", async ({ page }) => {
  const username = `e2e_${stamp()}`;
  const password = "correct horse battery";

  await landAsGuest(page);
  await createDeckWithCard(page, `Recover ${stamp()}`);
  const code = await signUp(page, username, password);

  await signOut(page);

  await page.goto("/account/recover");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Recovery code").fill(code.toLowerCase());
  await page.getByLabel("New password").fill("a different password");
  await page.getByRole("button", { name: "Set new password and sign in" }).click();
  await expect(page.getByRole("heading", { name: /Password changed/ })).toBeVisible();
  await page.getByRole("button", { name: /I saved it/ }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();

  // The old password is dead, the new one works.
  await signOut(page);
  await page.goto("/account");
  const form = page.locator("form").filter({ hasText: "Sign in" });
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(form.getByRole("alert")).toContainText("do not match");
  await form.getByLabel("Password").fill("a different password");
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
});
