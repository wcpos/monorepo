#!/usr/bin/env node
/**
 * Decide how much E2E this PR actually needs.
 *
 * Two narrowings, both from the same principle: only run what the diff can
 * possibly have broken.
 *
 *   behavioural=false  — every changed line is a comment, blank, or in a
 *                        markdown file. Comments are stripped before anything
 *                        executes, so no test can observe this change. Deploy
 *                        and E2E are skipped entirely (lint, typecheck and unit
 *                        tests still run in the Test workflow).
 *   only_specs=<list>  — every changed file is an E2E spec. A spec file is a
 *                        leaf: nothing imports it, so it cannot change what any
 *                        other spec does. Run just those specs.
 *   (neither)          — run the full suite.
 *
 * SAFETY. Ambiguity always resolves to "run everything": an unreadable diff, an
 * unrecognised file type, a line that is not unmistakably a comment. The failure
 * mode is a slow gate, never a missed regression. In particular a line is only
 * treated as a comment when it starts with a comment marker after trimming —
 * anything else, including a changed string that happens to contain `//`, forces
 * the full suite.
 *
 * Every other kind of file changes behaviour someone can observe: app and
 * package sources change the app under test; e2e helpers (fixtures, probes,
 * order-cleanup) are imported by many specs; playwright.config.ts and the
 * workflow change how the whole suite runs; the lockfile changes what is
 * installed.
 *
 * Usage: node scripts/e2e-change-scope.mjs <baseRef>
 */

import { spawnSync } from "node:child_process";

const baseRef = process.argv[2];

function emit({ behavioural = true, onlySpecs = "", reason }) {
  console.error(`[e2e-change-scope] ${reason}`);
  console.log(`behavioural=${behavioural}`);
  console.log(`only_specs=${onlySpecs}`);
  process.exit(0);
}

const runEverything = (reason) => emit({ reason: `full suite: ${reason}` });

if (!baseRef) runEverything("no base ref given");

const nameOnly = spawnSync(
  "git",
  ["diff", "--name-only", `${baseRef}...HEAD`],
  {
    encoding: "utf8",
  },
);
if (nameOnly.status !== 0) {
  runEverything(
    `git diff against ${baseRef} failed (${(nameOnly.stderr || "").trim()})`,
  );
}

const changed = nameOnly.stdout
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (changed.length === 0) runEverything("no changed files detected");

/* ---------- 1. comment/markdown-only? ---------- */

/**
 * Is this changed line entirely a comment?
 *
 * Starting with a comment marker is NOT enough: `/* note *\/ disableAuth();`
 * starts with one and executes code (greptile caught exactly this on #1327,
 * where it would have skipped deploy AND E2E for a behaviour-changing PR).
 * A line only counts when nothing executable survives the comment.
 * Cross-line block delimiters are ambiguous because `git diff -U0` omits the
 * unchanged lines whose execution they can alter, so they run the full suite.
 */
function isCommentOnlyLine(content) {
  // `//` comments the rest of the line, so nothing can follow it.
  if (content.startsWith("//")) return true;
  if (content.startsWith("/*")) {
    const closed = content.lastIndexOf("*/");
    if (closed === -1) return false;
    // Closed: anything after the final `*/` is code.
    return content.slice(closed + 2).trim() === "";
  }
  if (content.includes("*/")) return false;
  return false;
}
const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const DOC_EXTENSIONS = /\.(md|mdx)$/;

function isNonBehavioural() {
  // Every file must be either documentation or a code file we can prove only
  // changed in its comments.
  if (
    !changed.every(
      (file) => DOC_EXTENSIONS.test(file) || CODE_EXTENSIONS.test(file),
    )
  ) {
    return false;
  }
  const hunks = spawnSync("git", ["diff", "-U0", `${baseRef}...HEAD`, "--"], {
    encoding: "utf8",
  });
  if (hunks.status !== 0) return false;

  let file = "";
  for (const line of hunks.stdout.split("\n")) {
    if (line.startsWith("+++ b/")) {
      file = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    if (!line.startsWith("+") && !line.startsWith("-")) continue;
    // Markdown content is never executed.
    if (DOC_EXTENSIONS.test(file)) continue;
    const content = line.slice(1).trim();
    if (content === "") continue;
    if (!isCommentOnlyLine(content)) return false;
  }
  return true;
}

if (isNonBehavioural()) {
  emit({
    behavioural: false,
    reason:
      "comments and docs only — nothing executable changed, so deploy and E2E are skipped " +
      `(${changed.length} file(s))`,
  });
}

/* ---------- 2. spec-only? ---------- */

// Deliberately strict: the basename is interpolated into a regex alternation
// that Playwright receives, so anything outside this charset (spaces, regex
// metacharacters) must fall back to the full suite rather than silently select
// the wrong tests — or none, which would still exit 0 (greptile, #1327).
const E2E_SPEC = /^apps\/main\/e2e\/([A-Za-z0-9._-]+\.spec\.ts)$/;
const specs = new Set();
for (const file of changed) {
  const match = E2E_SPEC.exec(file);
  if (!match) runEverything(`${file} is not a spec file`);
  const name = match[1];
  // Cold-start specs belong to their own workflow; live specs never run here.
  if (name.endsWith(".cold.spec.ts") || name.endsWith(".live.spec.ts")) {
    runEverything(`${name} runs outside the default matrix`);
  }
  specs.add(name);
}

if (specs.size === 0) runEverything("no runnable specs in the diff");

const list = [...specs].sort();
emit({
  onlySpecs: list.join(" "),
  reason: `spec-only PR — narrowing to: ${list.join(", ")}`,
});
