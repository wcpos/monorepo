import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "e2e-change-scope.mjs",
);

/** Build a throwaway repo with a base commit and one "PR" commit on top. */
function scopeOf(mutate) {
  const repo = mkdtempSync(path.join(tmpdir(), "e2e-scope-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  };
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "Test");
    mkdirSync(path.join(repo, "apps/main/e2e"), { recursive: true });
    mkdirSync(path.join(repo, "packages/core/src"), { recursive: true });
    writeFileSync(
      path.join(repo, "apps/main/e2e/products.spec.ts"),
      'test("a", () => {});\n',
    );
    writeFileSync(
      path.join(repo, "apps/main/e2e/orders.spec.ts"),
      'test("b", () => {});\n',
    );
    writeFileSync(
      path.join(repo, "apps/main/e2e/fixtures.ts"),
      "export const helper = 1;\n",
    );
    writeFileSync(
      path.join(repo, "packages/core/src/index.ts"),
      "// header\nexport const x = {\n};\n",
    );
    writeFileSync(path.join(repo, "README.md"), "# docs\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    git("branch", "base-ref");

    mutate({
      repo,
      write: writeFileSync,
      append: appendFileSync,
      join: (p) => path.join(repo, p),
    });
    git("add", "-A");
    git("commit", "-qm", "pr");

    const result = spawnSync("node", [SCRIPT, "base-ref"], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(
      result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("="))
        .map(([key, value]) => [key, value ?? ""]),
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

test("a comment-only source change skips deploy and E2E", () => {
  const scope = scopeOf(({ append, join }) => {
    append(join("packages/core/src/index.ts"), "// another comment\n");
  });
  assert.equal(scope.behavioural, "false");
});

test("a markdown-only change skips deploy and E2E", () => {
  const scope = scopeOf(({ append, join }) => {
    append(join("README.md"), "more prose, and some `code` in a fence\n");
  });
  assert.equal(scope.behavioural, "false");
});

test("a real code change next to a comment still runs everything", () => {
  const scope = scopeOf(({ append, join }) => {
    append(
      join("packages/core/src/index.ts"),
      "// comment\nexport const y = 2;\n",
    );
  });
  assert.equal(scope.behavioural, "true");
  assert.equal(scope.only_specs, "");
});

test("a string that merely looks like a comment is NOT treated as one", () => {
  // The one way this analysis could silently skip a real change.
  const scope = scopeOf(({ append, join }) => {
    append(
      join("packages/core/src/index.ts"),
      'export const url = "https://x.test";\n',
    );
  });
  assert.equal(scope.behavioural, "true");
});

test("a closed block comment followed by code is NOT comment-only", () => {
  // greptile on #1327: `/* note */ disableAuth();` starts with a comment marker
  // but executes. Treating it as a comment skipped deploy AND E2E for a
  // behaviour-changing PR — the exact failure this analysis must never allow.
  const scope = scopeOf(({ append, join }) => {
    append(
      join("packages/core/src/index.ts"),
      "/* note */ export const danger = 1;\n",
    );
  });
  assert.equal(scope.behavioural, "true");
});

test("a generator method line is NOT comment-only", () => {
  const scope = scopeOf(({ write, join }) => {
    write(
      join("packages/core/src/index.ts"),
      "// header\nexport const x = {\n  *danger() { yield 1; },\n};\n",
    );
  });
  assert.equal(scope.behavioural, "true");
});

test("block delimiters around unchanged code run the full suite", () => {
  const scope = scopeOf(({ write, join }) => {
    write(
      join("packages/core/src/index.ts"),
      "// header\n/*\nexport const x = {\n};\n*/\n",
    );
  });
  assert.equal(scope.behavioural, "true");
});

test("a multi-line block comment conservatively runs the full suite", () => {
  const scope = scopeOf(({ append, join }) => {
    append(
      join("packages/core/src/index.ts"),
      "/* opening a block\n * more\n */\n",
    );
  });
  assert.equal(scope.behavioural, "true");
});

test("a spec basename with regex metacharacters refuses to narrow", () => {
  // Unescaped metacharacters would select the wrong tests — or none, and a
  // zero-test run still exits 0.
  const scope = scopeOf(({ write, join, repo }) => {
    write(join("apps/main/e2e/we(ird).spec.ts"), 'test("x", () => {});\n');
    void repo;
  });
  assert.equal(scope.only_specs, "");
});

test("spec-only changes narrow to those specs", () => {
  const scope = scopeOf(({ append, join }) => {
    append(join("apps/main/e2e/products.spec.ts"), 'test("c", () => {});\n');
    append(join("apps/main/e2e/orders.spec.ts"), 'test("d", () => {});\n');
  });
  assert.equal(scope.behavioural, "true");
  assert.equal(scope.only_specs, "orders.spec.ts products.spec.ts");
});

test("touching an e2e HELPER runs the full suite, not just specs", () => {
  // Helpers are imported by many specs — narrowing here would skip real coverage.
  const scope = scopeOf(({ append, join }) => {
    append(join("apps/main/e2e/fixtures.ts"), "export const other = 2;\n");
    append(join("apps/main/e2e/products.spec.ts"), 'test("e", () => {});\n');
  });
  assert.equal(scope.only_specs, "");
});

test("an app source change runs the full suite", () => {
  const scope = scopeOf(({ append, join }) => {
    append(join("packages/core/src/index.ts"), "export const z = 3;\n");
  });
  assert.equal(scope.behavioural, "true");
  assert.equal(scope.only_specs, "");
});
