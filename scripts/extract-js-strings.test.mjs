import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = new URL("./extract-js-strings.js", import.meta.url).pathname;

function writeFixtureFile(root, relativePath, contents) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

test("--check fails when source uses keys missing from the English catalog", () => {
  const root = mkdtempSync(join(tmpdir(), "wcpos-translations-check-"));

  writeFixtureFile(
    root,
    "packages/core/src/contexts/translations/locales/en/core.json",
    JSON.stringify({ "existing.key": "Existing copy" }, null, "\t"),
  );
  writeFixtureFile(
    root,
    "packages/core/src/example.tsx",
    `
      const title = t('existing.key', 'Existing copy');
      const body = t('missing.key', 'Missing copy');
    `,
  );

  const result = spawnSync(process.execPath, [scriptPath, root, "--check"], {
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /missing\.key/);
});

test("--check ignores translation calls inside source comments", () => {
  const root = mkdtempSync(join(tmpdir(), "wcpos-translations-comments-"));

  writeFixtureFile(
    root,
    "packages/core/src/contexts/translations/locales/en/core.json",
    JSON.stringify({ "existing.key": "Existing copy" }, null, "\t"),
  );
  writeFixtureFile(
    root,
    "packages/core/src/example.tsx",
    `
      const title = t('existing.key', 'Existing copy');
      // const body = t('missing.line_comment', 'Missing copy');
      /*
       * const footer = t('missing.block_comment', 'Missing copy');
       */
    `,
  );

  const result = spawnSync(process.execPath, [scriptPath, root, "--check"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("--check sees both footer count keys as literal calls", () => {
  const footerPaths = [
    "packages/core/src/screens/main/components/data-table/footer.tsx",
    "packages/core/src/screens/main/tax-rates/footer.tsx",
  ];

  for (const footerPath of footerPaths) {
    const root = mkdtempSync(join(tmpdir(), "wcpos-translations-footer-"));

    writeFixtureFile(
      root,
      "packages/core/src/contexts/translations/locales/en/core.json",
      JSON.stringify({}, null, "\t"),
    );
    writeFixtureFile(
      root,
      footerPath,
      readFileSync(new URL(`../${footerPath}`, import.meta.url), "utf8"),
    );

    const result = spawnSync(process.execPath, [scriptPath, root, "--check"], {
      encoding: "utf8",
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.notEqual(result.status, 0, `${footerPath}\n${output}`);
    assert.match(output, /common\.showing_of"/, footerPath);
    assert.match(output, /common\.showing_of_at_least/, footerPath);
  }
});
