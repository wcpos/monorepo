import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ACK_LABEL,
  COUNT_DROP_THRESHOLD,
  checkTestRemoval,
  countTestDeclarations,
  findAcknowledgement,
  findRemovals,
  formatFailure,
  parseNameStatusZ,
  prContext,
  readBlob,
  readEvent,
} from "./check-test-removal.mjs";

/* ------------------------------------------------------------------ counting */

test("counts it/test declarations and their modifiers", () => {
  assert.equal(countTestDeclarations("it('a', () => {})"), 1);
  assert.equal(countTestDeclarations("test('a', () => {})"), 1);
  assert.equal(
    countTestDeclarations("it.only('a', () => {})\nit.skip('b', () => {})"),
    2,
  );
  assert.equal(countTestDeclarations("it.each([1,2])('a %s', () => {})"), 1);
  assert.equal(countTestDeclarations("it.each`a`\n"), 1);
  assert.equal(countTestDeclarations("test.concurrent('a', () => {})"), 1);
});

test("does not count Playwright structure as tests", () => {
  // The motivating spec files are dense with these; counting them would make
  // the number track file shape instead of coverage.
  const source = [
    "test.describe('POS Checkout', () => {",
    "  test.beforeEach(async ({ page }) => {});",
    "  test.afterAll(async () => {});",
    "  test.use({ storageState: undefined });",
    "  test.step('inner', async () => {});",
    "  test.setTimeout(1000);",
    "  test('the only real test', async () => {});",
    "});",
  ].join("\n");
  assert.equal(countTestDeclarations(source), 1);
});

test("does not count a regex .test() call as a test declaration", () => {
  assert.equal(countTestDeclarations("if (/foo/.test(url)) return;"), 0);
  assert.equal(countTestDeclarations("const ok = pattern.test(value);"), 0);
  assert.equal(countTestDeclarations("latest(x); fastest(y); protest(z);"), 0);
});

/* ------------------------------------------------------- name-status parsing */

test("parses NUL-delimited name-status records, renames included", () => {
  const stdout =
    "M\0a.test.ts\0D\0b.test.ts\0R096\0old.test.ts\0new.test.ts\0A\0c.test.ts\0";
  assert.deepEqual(parseNameStatusZ(stdout), [
    { status: "M", oldPath: "a.test.ts", path: "a.test.ts" },
    { status: "D", oldPath: "b.test.ts", path: "b.test.ts" },
    { status: "R", oldPath: "old.test.ts", path: "new.test.ts" },
    { status: "A", oldPath: "c.test.ts", path: "c.test.ts" },
  ]);
});

/* ---------------------------------------------------------- threshold logic */

const sourceWith = (count) =>
  Array.from(
    { length: count },
    (_, index) => `it('case ${index}', () => {});`,
  ).join("\n");

/** A reader over `{ 'base:path': source, 'head:path': source }`. */
const readerFor = (blobs) => (side, filePath) =>
  blobs[`${side}:${filePath}`] ?? "";

test("a deleted test file trips regardless of how few tests it held", () => {
  const changes = [{ status: "D", oldPath: "a.test.ts", path: "a.test.ts" }];
  const { deleted, shrunk } = findRemovals(
    changes,
    readerFor({ "base:a.test.ts": sourceWith(1) }),
  );
  assert.equal(shrunk.length, 0);
  assert.deepEqual(deleted, [{ path: "a.test.ts", count: 1 }]);
});

test("a deleted NON-test file is ignored", () => {
  const changes = [
    { status: "D", oldPath: "src/index.ts", path: "src/index.ts" },
  ];
  const { deleted, shrunk } = findRemovals(changes, readerFor({}));
  assert.equal(deleted.length + shrunk.length, 0);
});

test("a pure rename does NOT trip — the content is identical", () => {
  const body = sourceWith(20);
  const changes = [
    { status: "R", oldPath: "old/a.spec.ts", path: "new/deep/a.spec.ts" },
  ];
  const { deleted, shrunk } = findRemovals(
    changes,
    readerFor({ "base:old/a.spec.ts": body, "head:new/deep/a.spec.ts": body }),
  );
  assert.equal(deleted.length, 0, "a move must not read as a deletion");
  assert.equal(shrunk.length, 0);
});

test("a rename that also loses a few tests stays under the threshold", () => {
  const sourceCount = COUNT_DROP_THRESHOLD + 17;
  const changes = [
    { status: "R", oldPath: "old/a.spec.ts", path: "new/a.spec.ts" },
  ];
  const { shrunk } = findRemovals(
    changes,
    readerFor({
      "base:old/a.spec.ts": sourceWith(sourceCount),
      "head:new/a.spec.ts": sourceWith(sourceCount - COUNT_DROP_THRESHOLD),
    }),
  );
  assert.equal(
    shrunk.length,
    0,
    `a drop of exactly ${COUNT_DROP_THRESHOLD} is tolerated`,
  );
});

test("renaming a test file OUT of the test-file family reads as a deletion", () => {
  // `pos-checkout.spec.ts` -> `pos-checkout.ts` keeps every line and stops
  // running entirely; --find-renames reports it as R, so the count check alone
  // would see a 0 delta and wave it through.
  const body = sourceWith(14);
  const changes = [{ status: "R", oldPath: "e2e/a.spec.ts", path: "e2e/a.ts" }];
  const { deleted } = findRemovals(
    changes,
    readerFor({ "base:e2e/a.spec.ts": body, "head:e2e/a.ts": body }),
  );
  assert.deepEqual(deleted, [{ path: "e2e/a.spec.ts -> e2e/a.ts", count: 14 }]);
});

test("a drop of more than the threshold trips, and reports the counts", () => {
  const changes = [{ status: "M", oldPath: "a.test.ts", path: "a.test.ts" }];
  const { shrunk } = findRemovals(
    changes,
    readerFor({
      "base:a.test.ts": sourceWith(20),
      "head:a.test.ts": sourceWith(16),
    }),
  );
  assert.deepEqual(shrunk, [
    {
      path: "a.test.ts",
      oldPath: "a.test.ts",
      before: 20,
      after: 16,
      delta: -4,
    },
  ]);
});

test("adding tests never trips", () => {
  const changes = [{ status: "M", oldPath: "a.test.ts", path: "a.test.ts" }];
  const { deleted, shrunk } = findRemovals(
    changes,
    readerFor({
      "base:a.test.ts": sourceWith(2),
      "head:a.test.ts": sourceWith(40),
    }),
  );
  assert.equal(deleted.length + shrunk.length, 0);
});

test("a brand-new test file never trips", () => {
  const changes = [{ status: "A", oldPath: "a.test.ts", path: "a.test.ts" }];
  const { deleted, shrunk } = findRemovals(
    changes,
    readerFor({ "head:a.test.ts": sourceWith(9) }),
  );
  assert.equal(deleted.length + shrunk.length, 0);
});

/* ------------------------------------------------------------ acknowledgement */

test("the label acknowledges", () => {
  const event = {
    pull_request: {
      labels: [{ name: "other" }, { name: ACK_LABEL }],
      body: "",
    },
  };
  assert.equal(findAcknowledgement(event)?.source, `label \`${ACK_LABEL}\``);
});

test("a Test-Removal line in the PR body acknowledges", () => {
  const event = {
    pull_request: {
      labels: [],
      body: "Some prose\n\nTest-Removal: the feature is gone\n",
    },
  };
  const found = findAcknowledgement(event);
  assert.equal(found?.source, "PR body");
  assert.equal(found.line, "Test-Removal: the feature is gone");
});

test("a Test-Removal trailer in any commit message acknowledges", () => {
  const found = findAcknowledgement(null, [
    "chore: tidy",
    "refactor: split\n\nTest-Removal: moved",
  ]);
  assert.equal(found?.source, "commit message");
  assert.equal(found.line, "Test-Removal: moved");
});

test("an empty or hand-wavy Test-Removal line does not acknowledge", () => {
  assert.equal(
    findAcknowledgement({
      pull_request: { labels: [], body: "Test-Removal:" },
    }),
    null,
  );
  assert.equal(
    findAcknowledgement({
      pull_request: { labels: [], body: "Test-Removal:   " },
    }),
    null,
  );
  assert.equal(
    findAcknowledgement({
      pull_request: { labels: [], body: "no marker here" },
    }),
    null,
  );
  assert.equal(findAcknowledgement(null, ["just a commit"]), null);
});

/* ------------------------------------------------------------------ messaging */

test("the failure names every file, its counts, and all three ways to acknowledge", () => {
  const message = formatFailure({
    deleted: [{ path: "e2e/pos-checkout.spec.ts", count: 14 }],
    shrunk: [
      {
        path: "a.test.ts",
        oldPath: "a.test.ts",
        before: 20,
        after: 15,
        delta: -5,
      },
    ],
  });
  assert.match(message, /e2e\/pos-checkout\.spec\.ts {2}\(14 tests\)/);
  assert.match(message, /a\.test\.ts {2}20 -> 15 \(-5\)/);
  assert.match(message, /removes 19 tests/);
  assert.match(message, /Test-Removal:/);
  assert.match(message, new RegExp(ACK_LABEL));
  assert.match(message, /commit message/);
});

/* ---------------------------------------------------------------- PR context */

test("no PR context outside a pull_request event", () => {
  assert.equal(prContext({}), null);
  assert.equal(
    prContext({ GITHUB_EVENT_NAME: "push", GITHUB_BASE_REF: "next" }),
    null,
  );
  assert.equal(
    prContext({ GITHUB_EVENT_NAME: "pull_request" }),
    null,
    "no base ref",
  );
  assert.deepEqual(
    prContext({ GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_REF: "next" }),
    {
      baseRef: "next",
      eventPath: undefined,
    },
  );
});

/* ------------------------------------------------------- end to end, over git */

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "check-test-removal-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q");
  git("branch", "-M", "next");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  const write = (relative, content) => {
    mkdirSync(path.join(dir, path.dirname(relative)), { recursive: true });
    writeFileSync(path.join(dir, relative), content);
  };
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", message);
  };
  write("e2e/checkout.spec.ts", sourceWith(14));
  write("src/util.test.ts", sourceWith(20));
  commit("base");
  git("branch", "base-ref");
  return { dir, git, write, commit };
}

const run = (dir, env = {}) => {
  try {
    checkTestRemoval({
      cwd: dir,
      baseOverride: env.GITHUB_EVENT_PATH ? undefined : "base-ref",
      env: {
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_BASE_REF: "base-ref",
        ...env,
      },
    });
    return null;
  } catch (error) {
    return error.message;
  }
};

test("readBlob returns empty only for a missing path", (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  const base = repo.git("rev-parse", "base-ref").trim();

  assert.equal(readBlob(base, "missing.test.ts", repo.dir), "");
  assert.throws(
    () => readBlob("not-a-revision", "src/util.test.ts", repo.dir),
    /cannot read not-a-revision:src\/util\.test\.ts/,
  );
});

test("end to end: the event base SHA wins over an advanced base ref", (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  const base = repo.git("rev-parse", "base-ref").trim();
  repo.write("src/util.test.ts", sourceWith(10));
  repo.commit("test: thin out util");
  repo.git("branch", "-f", "base-ref", "HEAD");
  repo.write(
    "event.json",
    JSON.stringify({ pull_request: { base: { sha: base }, labels: [] } }),
  );

  const message = run(repo.dir, {
    GITHUB_EVENT_PATH: path.join(repo.dir, "event.json"),
  });
  assert.ok(message, "expected the immutable event base to expose the removal");
  assert.match(message, /src\/util\.test\.ts {2}20 -> 10 \(-10\)/);
});

test("malformed event JSON is ignored", (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  repo.write("event.json", "{not-json");

  assert.equal(readEvent(path.join(repo.dir, "event.json")), null);
});

test("end to end: a label in a partially malformed event acknowledges removal", (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  const base = repo.git("rev-parse", "base-ref").trim();
  repo.write("src/util.test.ts", sourceWith(10));
  repo.commit("test: thin out util");
  repo.write(
    "event.json",
    JSON.stringify({
      pull_request: {
        base: { sha: base },
        body: null,
        labels: [null, { name: ACK_LABEL }],
      },
    }),
  );

  assert.equal(
    run(repo.dir, { GITHUB_EVENT_PATH: path.join(repo.dir, "event.json") }),
    null,
  );
});

test("end to end: deleting a spec file fails the check", (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  execFileSync("git", ["rm", "-q", "e2e/checkout.spec.ts"], { cwd: repo.dir });
  repo.commit("test(e2e): drop the checkout spec");

  const message = run(repo.dir);
  assert.ok(message, "expected the check to fail");
  assert.match(message, /e2e\/checkout\.spec\.ts {2}\(14 tests\)/);
});

test("end to end: moving a spec across directories passes", (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  mkdirSync(path.join(repo.dir, "src/e2e"), { recursive: true });
  execFileSync(
    "git",
    ["mv", "e2e/checkout.spec.ts", "src/e2e/pos-checkout.spec.ts"],
    {
      cwd: repo.dir,
    },
  );
  repo.commit("refactor(e2e): move the checkout spec");

  assert.equal(run(repo.dir), null, "a pure move must not trip the tripwire");
});

test("end to end: gutting a spec in place fails, and the trailer clears it", (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  repo.write("src/util.test.ts", sourceWith(10));
  repo.commit("test: thin out util");

  const message = run(repo.dir);
  assert.ok(message, "expected the check to fail");
  assert.match(message, /src\/util\.test\.ts {2}20 -> 10 \(-10\)/);

  repo.write("src/util.test.ts", `${sourceWith(10)}\n// touch`);
  repo.commit(
    "test: thin out util\n\nTest-Removal: the util was deleted, its tests moved",
  );
  assert.equal(run(repo.dir), null, "the commit trailer must clear the check");
});

test("end to end: no-ops outside a PR context, without touching git", (t) => {
  const repo = makeRepo();
  t.after(() => rmSync(repo.dir, { recursive: true, force: true }));
  execFileSync("git", ["rm", "-q", "e2e/checkout.spec.ts"], { cwd: repo.dir });
  repo.commit("test(e2e): drop the checkout spec");

  // No baseOverride and no pull_request env — a push build or a local run.
  assert.doesNotThrow(() =>
    checkTestRemoval({
      cwd: repo.dir,
      env: { GITHUB_EVENT_NAME: "push", GITHUB_BASE_REF: "next" },
    }),
  );
  assert.doesNotThrow(() => checkTestRemoval({ cwd: repo.dir, env: {} }));
});
