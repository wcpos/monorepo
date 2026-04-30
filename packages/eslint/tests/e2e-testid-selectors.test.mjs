import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ESLint } from "eslint";

import { config } from "../index.js";

async function lintE2E(code) {
  const eslint = new ESLint({
    baseConfig: config,
    overrideConfigFile: true,
  });
  const [result] = await eslint.lintText(code, {
    filePath: "apps/main/e2e/example.spec.ts",
  });
  return result.messages
    .filter(({ ruleId }) => ruleId === "no-restricted-syntax")
    .map(({ message, ruleId }) => ({ message, ruleId }));
}

test("rejects localized Playwright selectors in e2e tests", async () => {
  const messages = await lintE2E(`
		test('bad selectors', async ({ page }) => {
			await page.getByText('Process Refund').click();
			await page.getByPlaceholder('Search products').fill('shirt');
			await page.getByLabel('Email').fill('a@example.com');
			await page.getByRole('button', { name: 'Process Refund' }).click();
			await page.locator('text=Process Refund').click();
		});
	`);

  assert.equal(messages.length, 5);
  assert(messages.every(({ ruleId }) => ruleId === "no-restricted-syntax"));
});

test("allows testID selectors in e2e tests", async () => {
  const messages = await lintE2E(`
		test('stable selectors', async ({ page }) => {
			await page.getByTestId('process-refund-button').click();
		});
	`);

  assert.deepEqual(messages, []);
});

function listE2EFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listE2EFiles(path);
    }
    return /\.(ts|tsx|js|jsx)$/.test(path) ? [path] : [];
  });
}

test("repo e2e tests do not use localized selectors", async () => {
  const e2eDir = fileURLToPath(
    new URL("../../../apps/main/e2e", import.meta.url),
  );
  const eslint = new ESLint({
    baseConfig: config,
    overrideConfigFile: true,
  });
  const results = await eslint.lintFiles(listE2EFiles(e2eDir));
  const violations = results.flatMap((result) =>
    result.messages
      .filter(({ ruleId }) => ruleId === "no-restricted-syntax")
      .map(
        ({ line, column, message }) =>
          `${result.filePath}:${line}:${column} ${message}`,
      ),
  );

  assert.deepEqual(violations, []);
});
