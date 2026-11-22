// The main things a user does in JobPulse, in order, in one browser tab.
// The test database starts empty except for 8 demo jobs (backend/src/db/seed.ts).
import { expect, Page, test } from "@playwright/test";
import { randomBytes } from "node:crypto";

test.describe.configure({ mode: "serial" });

const EMAIL = "e2e@jobpulse.test";
const PASSWORD = randomBytes(12).toString("base64url"); // new every run, never saved
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

test("the API is closed until you log in", async ({ request }) => {
  expect((await request.get("/api/jobs")).status()).toBe(401);
  const status = await (await request.get("/api/auth/status")).json();
  expect(status).toEqual({ setupRequired: true, user: null });
});

test("first visit: create the owner account", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create your JobPulse account" })).toBeVisible();

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat password").fill(PASSWORD + "x");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("The two passwords are different.")).toBeVisible();

  await page.getByLabel("Repeat password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Find your next job" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Frontend Developer" })).toBeVisible();
});

test("sign-up is closed once the account exists", async ({ request }) => {
  const response = await request.post("/api/auth/setup", { data: { email: "other@jobpulse.test", password: "another-password-123" } });
  expect(response.status()).toBe(409);
});

test("filter jobs by category and search", async () => {
  await page.getByLabel("Category").selectOption("Bank");
  await expect(page.getByRole("link", { name: "Senior Officer (IT)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Frontend Developer" })).toHaveCount(0);

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await page.getByLabel("Search by job title or company").fill("python");
  await expect(page.getByRole("link", { name: "Python Developer Intern" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Backend Developer" })).toHaveCount(0);
});

test("open a job, AI explanation fails politely, save it", async () => {
  await page.getByRole("link", { name: "Python Developer Intern" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Python Developer Intern" })).toBeVisible();

  // the test has no AI service running: the page must say so instead of breaking
  await page.getByRole("button", { name: "Explain with AI" }).click();
  await expect(page.getByText("The AI service is not running")).toBeVisible();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
});

test("the saved job is in My applications", async () => {
  await page.goto("/saved");
  await expect(page.getByRole("heading", { name: "My applications" })).toBeVisible();
  await expect(page.getByText("Python Developer Intern")).toBeVisible();
});

test("Ask AI shows a clear message when the AI is off", async () => {
  await page.goto("/ask");
  await page.getByLabel("Your question").fill("Any bank jobs?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText("The AI service is not running")).toBeVisible();
});

test("log out, wrong password, log back in", async () => {
  await page.goto("/");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Log in to JobPulse" })).toBeVisible();

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Find your next job" })).toBeVisible();

  // still the same account: the saved job is still there
  await page.goto("/saved");
  await expect(page.getByText("Python Developer Intern")).toBeVisible();
});
