import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWLIST,
  OTHER_LANES,
  checkCiTestMatrix,
  detectLanes,
  findTestFiles,
  parseWorkspaceGlobs,
  readSubmodulePaths,
  resolveWorkspacePackages,
  surveyPackages,
} from "./check-ci-test-matrix.mjs";

/* --------------------------------------------------------- workspace parsing */

test("reads the package globs out of pnpm-workspace.yaml", () => {
  const yaml = [
    "packages:",
    '  - "apps/*"',
    '  - "packages/*"',
    "  - tools/one",
    '  - "!packages/excluded"',
    "nodeLinker: hoisted",
    "overrides:",
    '  expo: "~57.0.8"',
  ].join("\n");
  assert.deepEqual(parseWorkspaceGlobs(yaml), [
    "apps/*",
    "packages/*",
    "tools/one",
  ]);
});

test("the real workspace file still parses", () => {
  // A silent [] here would make every package look testless and the check pass
  // vacuously — the exact failure mode it exists to prevent.
  assert.ok(surveyPackages().length > 5);
});

/* ---------------------------------------------------------------- fixture fs */

function makeTree() {
  const root = mkdtempSync(path.join(tmpdir(), "ci-matrix-"));
  const write = (relative, content) => {
    mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(root, relative), content);
  };
  const pkg = (dir, name, scripts = {}) =>
    write(`${dir}/package.json`, JSON.stringify({ name, scripts }));
  return { root, write, pkg };
}

test("resolves globs to directories that actually hold a package.json", (t) => {
  const tree = makeTree();
  t.after(() => rmSync(tree.root, { recursive: true, force: true }));
  tree.pkg("packages/alpha", "@wcpos/alpha");
  tree.pkg("apps/beta", "@wcpos/beta");
  mkdirSync(path.join(tree.root, "packages/not-a-package"), {
    recursive: true,
  });

  assert.deepEqual(
    resolveWorkspacePackages(["apps/*", "packages/*"], tree.root),
    ["apps/beta", "packages/alpha"],
  );
});

test("finds test files and skips build output", (t) => {
  const tree = makeTree();
  t.after(() => rmSync(tree.root, { recursive: true, force: true }));
  tree.write("packages/alpha/src/a.test.ts", "");
  tree.write("packages/alpha/src/nested/b.spec.tsx", "");
  tree.write("packages/alpha/src/c.test.mjs", "");
  tree.write("packages/alpha/src/index.ts", "");
  tree.write("packages/alpha/dist/d.test.js", "");
  tree.write("packages/alpha/node_modules/dep/e.test.js", "");
  tree.write("packages/alpha/coverage/f.test.js", "");

  assert.deepEqual(findTestFiles("packages/alpha", tree.root).sort(), [
    "packages/alpha/src/a.test.ts",
    "packages/alpha/src/c.test.mjs",
    "packages/alpha/src/nested/b.spec.tsx",
  ]);
});

/* -------------------------------------------------------------- lane parsing */

const PACKAGES = [
  { dir: "packages/core", name: "@wcpos/core" },
  { dir: "packages/order-math", name: "@wcpos/order-math" },
  { dir: "packages/query", name: "@wcpos/query" },
  { dir: "packages/printer", name: "@wcpos/printer" },
  { dir: "packages/scanner", name: "@wcpos/scanner" },
  { dir: "packages/eslint", name: "@wcpos/eslint-config" },
  { dir: "packages/dark", name: "@wcpos/dark" },
  { dir: "apps/main", name: "@wcpos/main" },
];

test("shape 1: a for-loop list covers every package it names", () => {
  const lanes = detectLanes(
    [
      [
        "test.yml",
        "for pkg in core order-math printer; do\n  cd packages/$pkg\ndone",
      ],
    ],
    PACKAGES,
  );
  assert.ok(lanes.has("packages/core"));
  assert.ok(lanes.has("packages/order-math"));
  assert.ok(lanes.has("packages/printer"));
  assert.ok(!lanes.has("packages/dark"));
});

test("shape 1: a loop token may name the package instead of the directory", () => {
  // packages/eslint publishes @wcpos/eslint-config — directory-only matching
  // would call it dark while CI runs it.
  const lanes = detectLanes(
    [["test.yml", "for pkg in eslint-config; do\n  x\ndone"]],
    PACKAGES,
  );
  assert.ok(lanes.has("packages/eslint"));
});

test("shape 2: --filter counts only alongside a test verb", () => {
  const covered = detectLanes(
    [["w.yml", "pnpm --filter @wcpos/main exec jest --ci"]],
    PACKAGES,
  );
  assert.ok(covered.has("apps/main"));

  const building = detectLanes(
    [["w.yml", "pnpm --filter @wcpos/main build"]],
    PACKAGES,
  );
  assert.ok(!building.has("apps/main"), "a build is not a test lane");
});

test("shape 2: every --filter on a chained line is seen, not just the first", () => {
  // Regression: a greedy tail capture consumed the rest of the line, so the
  // second package on a `&&` chain silently read as dark.
  const lanes = detectLanes(
    [
      [
        "package.json#test:scripts",
        "node x.mjs && pnpm --filter @wcpos/printer test && pnpm --filter @wcpos/eslint-config test",
      ],
    ],
    PACKAGES,
  );
  assert.ok(lanes.has("packages/printer"));
  assert.ok(
    lanes.has("packages/eslint"),
    "the second --filter on the line must be seen",
  );
});

test("shape 2: a package cannot borrow the test verb from the next command", () => {
  const lanes = detectLanes(
    [
      [
        "w.yml",
        "pnpm --filter @wcpos/dark build && pnpm --filter @wcpos/core test",
      ],
    ],
    PACKAGES,
  );
  assert.ok(lanes.has("packages/core"));
  assert.ok(!lanes.has("packages/dark"), "the && must cut the tail");
});

test("shape 3: cd into a package followed by a runner counts", () => {
  const lanes = detectLanes(
    [
      [
        "test.yml",
        "cd packages/query\nnpx jest --config jest.config.cjs --ci\ncd ../..",
      ],
    ],
    PACKAGES,
  );
  assert.ok(lanes.has("packages/query"));

  const noRunner = detectLanes(
    [["test.yml", "cd packages/query\nnpx tsc --noEmit"]],
    PACKAGES,
  );
  assert.ok(!noRunner.has("packages/query"));
});

test("a package mentioned nowhere is dark", () => {
  const lanes = detectLanes(
    [["test.yml", "for pkg in core; do x; done"]],
    PACKAGES,
  );
  assert.ok(!lanes.has("packages/dark"));
});

/* -------------------------------------------------------------- gitmodules */

test("reads submodule paths from .gitmodules", (t) => {
  const tree = makeTree();
  t.after(() => rmSync(tree.root, { recursive: true, force: true }));
  tree.write(
    ".gitmodules",
    '[submodule "apps/electron"]\n\tpath = apps/electron\n\turl = x\n[submodule "apps/web"]\n\tpath = apps/web\n\turl = y\n',
  );
  assert.deepEqual([...readSubmodulePaths(tree.root)].sort(), [
    "apps/electron",
    "apps/web",
  ]);
});

test("the repo declares its submodules, so their tests never read as dark", () => {
  // apps/web and apps/electron appear or vanish depending on whether the
  // checkout initialized them; the survey must not depend on that.
  const submodules = readSubmodulePaths();
  assert.ok(submodules.has("apps/web"));
  assert.ok(submodules.has("apps/electron"));
});

/* ------------------------------------------------------------ live invariants */

test("the current tree has no dark packages", () => {
  assert.doesNotThrow(() => checkCiTestMatrix());
});

test("every allowlist entry carries a reason, and a TODO if it is temporary", () => {
  for (const entry of ALLOWLIST) {
    assert.ok(entry.dir, "an allowlist entry needs a dir");
    assert.ok(entry.reason?.trim(), `${entry.dir} needs a reason`);
    assert.match(
      entry.reason,
      /TODO\(#\d+\)|permanent/,
      `${entry.dir}: cite an issue or say permanent`,
    );
  }
});

test("every other-lane entry points at a workflow that exists", () => {
  // An OTHER_LANES entry is a promise that some other workflow runs those
  // specs. If that workflow is renamed or deleted the specs go dark silently,
  // which is the whole failure this check exists to prevent.
  const workflowDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.github/workflows",
  );
  const workflows = new Set(readdirSync(workflowDir));
  for (const entry of OTHER_LANES) {
    assert.ok(
      workflows.has(entry.workflow),
      `${entry.dir} points at a missing ${entry.workflow}`,
    );
    assert.ok(entry.reason?.trim(), `${entry.dir} needs a reason`);
    assert.ok(
      existsSync(path.resolve(workflowDir, "../..", entry.dir)),
      `${entry.dir} is gone`,
    );
  }
});
