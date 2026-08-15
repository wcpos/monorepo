#!/usr/bin/env node
/**
 * CI-matrix completeness tripwire (ruling R15, 2026-08-06).
 *
 * packages/order-math carried 467 money tests that ran in no CI lane for two
 * months. Nothing was red, because nothing was run. A test suite that no
 * workflow invokes is not coverage — it is a file.
 *
 * This walks the workspace, finds every package that ships `*.test.*` /
 * `*.spec.*` files, and fails listing any of them that no CI lane executes.
 * The point is not to be clever; it is to make every exclusion something a
 * human wrote down. If a package's tests deliberately do not run in the unit
 * lane, it goes in ALLOWLIST below with a reason next to it.
 *
 * Lane detection is deliberately textual — the shell inside a workflow step is
 * where the truth lives, and a YAML AST would only get us to the same strings
 * with more ceremony. Three shapes are recognised, matching what test.yml
 * actually does today:
 *   1. `for pkg in a b c; do` loop lists
 *   2. `pnpm --filter @wcpos/<name> … <test verb>`
 *   3. `cd packages/<name>` followed, within the same step, by jest/vitest
 * Add a fourth shape here the day a workflow invents one — a lane this cannot
 * see reads as "dark", which fails loudly rather than passing quietly.
 *
 * Root `package.json` scripts are searched too: `pnpm test:scripts` is a Lint
 * job step, so a package tested from there (virtual-printer) is genuinely run.
 *
 * Exits 0 fast anywhere — no git, no network, no PR context needed.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Never walked. `.`-prefixed directories are skipped separately. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "ios",
  "android",
]);

/**
 * Test files that belong to a lane OTHER than the unit-test lane, keyed by the
 * directory they live in. These are not exclusions from CI — they are pointers
 * to the workflow that does run them, and the check verifies that workflow
 * exists before honouring the entry.
 */
export const OTHER_LANES = [
  {
    dir: "apps/main/e2e",
    workflow: "deploy.yml",
    // Match the single-line command or its sharded multi-line form, but keep
    // `cd apps/main` and the Playwright invocation in the same workflow step.
    invocation:
      /(?:^|\n)[ \t]*(?:-[ \t]*)?(?:run:[ \t]*)?cd[ \t]+apps\/main[ \t]*(?:&&[ \t]*npx[ \t]+playwright[ \t]+test\b|\r?\n(?:(?![ \t]*(?:-[ \t]*)?[A-Za-z_][\w-]*:[^\n]*(?:\n|$))[^\r\n]*(?:\r?\n|$))*?[ \t]*npx[ \t]+playwright[ \t]+test\b)/m,
    reason:
      "Playwright specs — run against a deployed preview by the e2e job in deploy.yml",
  },
  // No Maestro entry. `apps/main/.maestro` still holds native flows, but #1027
  // retired e2e-native.yml on next and no workflow invokes maestro any more, so
  // an entry here would assert a lane that does not exist — which is precisely
  // what the `invocation` check above refuses to let anyone write. The flows are
  // not `*.test.*` files, so they were never counted by this check either way;
  // they are simply unrun, and that is a product call, not a matrix bug.
];

/**
 * Packages whose tests intentionally run in NO lane of THIS repo. Every entry
 * needs a reason and, if the reason is "not yet", a TODO with the issue that
 * will remove it. An empty list is the goal state.
 *
 * Submodules are not listed here — they are detected from .gitmodules, because
 * whether apps/web and apps/electron are even present depends on whether the
 * checkout initialized them, and a check that reports different packages
 * depending on that is a check nobody can trust.
 */
export const ALLOWLIST = [
  {
    dir: "apps/template-studio",
    // TODO(#1017): 15 of the 17 files are CI-ready and pass today. The other two
    // (thermal-gallery-columns, studio-paths) read gallery templates from a
    // SIBLING woocommerce-pos plugin checkout, which this repo's CI never checks
    // out — and thermal-gallery-columns is red even with that checkout present
    // (its `engine === 'thermal'` filter matches nothing, so the CPL-overflow
    // matrix it exists to check has not run in a long time). #1017 decides
    // whether the gallery specs get an opt-in guard or CI gets the templates.
    reason:
      "gallery specs need the sibling woocommerce-pos checkout — TODO(#1017)",
  },
];

/** Submodule paths from .gitmodules — separate repositories with their own CI. */
export function readSubmodulePaths(root = repoRoot) {
  const gitmodules = path.join(root, ".gitmodules");
  if (!existsSync(gitmodules)) return new Set();
  const text = readFileSync(gitmodules, "utf8");
  return new Set(
    [...text.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)].map((match) => match[1]),
  );
}

/** Words that make a workflow line an actual test invocation rather than a mention. */
const TEST_VERB = /\b(test|tests|jest|vitest|playwright|maestro)\b/;

/** Commands that prove a package loop executes tests rather than reporting on them. */
const LOOP_TEST_INVOCATION =
  /\b(?:jest|vitest|playwright|maestro)\b|\bpnpm\b[^\n;&|]*\btests?\b/;

/** Workspace globs from pnpm-workspace.yaml — `apps/*`, `packages/*`, or a literal dir. */
export function parseWorkspaceGlobs(yamlText) {
  const block = /^packages:\s*$([\s\S]*?)^\S/m.exec(`${yamlText}\n￿`);
  const body = block ? block[1] : "";
  return [...body.matchAll(/^\s*-\s*["']?([^"'\s#]+)["']?\s*$/gm)]
    .map((match) => match[1])
    .filter((glob) => !glob.startsWith("!"));
}

/** Directories the globs resolve to, relative to the repo root, that hold a package.json. */
export function resolveWorkspacePackages(globs, root = repoRoot) {
  const dirs = [];
  for (const glob of globs) {
    const simpleWildcard = /^[^*?[\]{}]+\/\*$/.test(glob);
    if (/[*?[\]{}]/.test(glob) && !simpleWildcard) {
      throw new Error(
        `Unsupported workspace glob \`${glob}\` — use a literal directory or one trailing /*`,
      );
    }
    if (simpleWildcard) {
      const parent = glob.slice(0, -2);
      const absolute = path.join(root, parent);
      if (!existsSync(absolute)) continue;
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        dirs.push(`${parent}/${entry.name}`);
      }
    } else if (existsSync(path.join(root, glob))) {
      dirs.push(glob);
    }
  }
  return dirs
    .filter((dir) => existsSync(path.join(root, dir, "package.json")))
    .sort();
}

/** Every `*.test.*` / `*.spec.*` file under `dir`, repo-relative. */
export function findTestFiles(dir, root = repoRoot) {
  const found = [];
  const walk = (relative) => {
    const absolute = path.join(root, relative);
    let entries;
    try {
      entries = readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (TEST_FILE.test(entry.name)) found.push(child);
    }
  };
  walk(dir);
  return found;
}

/**
 * Every workspace package, with its name, its test files split into unit-lane
 * files and files belonging to another lane, and whether it declares a `test`
 * script at all.
 */
export function surveyPackages(root = repoRoot) {
  const globs = parseWorkspaceGlobs(
    readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8"),
  );
  return resolveWorkspacePackages(globs, root).map((dir) => {
    const manifest = JSON.parse(
      readFileSync(path.join(root, dir, "package.json"), "utf8"),
    );
    const all = findTestFiles(dir, root);
    const otherLane = [];
    const unit = [];
    for (const file of all) {
      const lane = OTHER_LANES.find((entry) =>
        file.startsWith(`${entry.dir}/`),
      );
      if (lane) otherLane.push({ file, lane });
      else unit.push(file);
    }
    return {
      dir,
      name: manifest.name,
      hasTestScript: Boolean(manifest.scripts?.test),
      unit,
      otherLane,
    };
  });
}

/**
 * Package directories a CI lane runs, mapped to the text that proves it.
 * `packages` is the survey, used to resolve loop tokens — a token can name a
 * directory (`order-math`) or a package (`eslint-config` -> packages/eslint).
 */
export function detectLanes(sources, packages) {
  const byDir = new Map(packages.map((entry) => [entry.dir, entry.dir]));
  const byName = new Map(packages.map((entry) => [entry.name, entry.dir]));
  const evidence = new Map();
  const record = (dir, source, proof) => {
    if (!dir) return;
    if (!evidence.has(dir)) evidence.set(dir, []);
    evidence.get(dir).push(`${source}: ${proof.trim()}`);
  };
  /** A loop/filter token — `core`, `order-math`, `eslint-config`, `@wcpos/query`. */
  const resolveToken = (token) => {
    const bare = token.replace(/^@wcpos\//, "");
    return (
      byName.get(token) ??
      byName.get(`@wcpos/${bare}`) ??
      byDir.get(`packages/${bare}`) ??
      byDir.get(`apps/${bare}`) ??
      null
    );
  };

  for (const [source, rawText] of sources) {
    // Stripped here as well as in readLaneSources: the invariant "a commented
    // command is not a lane" has to hold for every caller, and stripping twice
    // is a no-op.
    const text = stripComments(rawText);
    // Shape 1 — `for pkg in core components database; do`
    for (const match of text.matchAll(
      /for\s+\w+\s+in\s+([^;\n]+);\s*do\b([\s\S]*?)\bdone\b/g,
    )) {
      if (!LOOP_TEST_INVOCATION.test(match[2])) continue;
      for (const token of match[1].trim().split(/\s+/)) {
        if (token.startsWith("$")) continue;
        record(resolveToken(token), source, `for … in ${match[1]}; do`);
      }
    }
    // Shape 2 — `pnpm --filter @wcpos/main exec jest`, `pnpm --filter @wcpos/printer test`.
    // The tail is a LOOKAHEAD, not a capture: one line often chains several
    // `--filter` commands with `&&`, and consuming to end-of-line would skip
    // every filter after the first. It is then cut at the next command
    // separator, so a package built on one command cannot borrow the `test`
    // verb from the next one.
    for (const match of text.matchAll(
      /--filter[= ]+'?"?(@wcpos\/[\w-]+)'?"?(?=([^\n]*))/g,
    )) {
      const tail = match[2].split(/&&|\|\||;/)[0];
      if (!TEST_VERB.test(tail)) continue;
      record(resolveToken(match[1]), source, match[0] + tail);
    }
    // Shape 3 — `cd packages/query` then jest/vitest inside the same step.
    for (const match of text.matchAll(/cd\s+((?:packages|apps)\/[\w-]+)/g)) {
      const window = text
        .slice(match.index, match.index + 400)
        .split(/^\s*-\s+[A-Za-z_][\w-]*:/m, 1)[0];
      if (!/\b(jest|vitest|playwright)\b/.test(window)) continue;
      record(byDir.get(match[1]), source, match[0]);
    }
  }
  return evidence;
}

/**
 * Workflow text with comment bodies blanked out.
 *
 * Every shape below is a text scan, so the words that prove a lane exists are
 * still sitting in the file after somebody comments the command out — and
 * commenting a command out is the cheapest possible way to turn a suite off.
 * A commented invocation must therefore read as NO invocation.
 *
 * `#` opens a comment only at the start of a line or after whitespace, which is
 * true in YAML and in the shell inside a `run:` block alike. That guard is what
 * keeps `echo "## 📊 Test Coverage Summary"` — a real line in test.yml — from
 * blanking the rest of the step. Newlines survive so line-oriented patterns and
 * the shape-3 window still see the original structure.
 */
export function stripComments(text) {
  return text.replace(
    /(^|[ \t])#[^\n]*/gm,
    (match, lead) => lead + " ".repeat(match.length - lead.length),
  );
}

/** The workflow files and root package.json scripts that can run tests. */
export function readLaneSources(root = repoRoot) {
  const workflowDir = path.join(root, ".github/workflows");
  const sources = readdirSync(workflowDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => [
      `.github/workflows/${name}`,
      stripComments(readFileSync(path.join(workflowDir, name), "utf8")),
    ]);
  const manifest = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  // Only scripts a workflow actually invokes count. `test:scripts` runs in the
  // Lint job; `test` (turbo) is a local convenience and runs in no lane — the
  // negative lookahead is what keeps `pnpm test:scripts` from also counting as
  // an invocation of the `test` script.
  const invoked = Object.entries(manifest.scripts ?? {}).filter(([name]) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return sources.some(([, text]) =>
      new RegExp(`pnpm\\s+(run\\s+)?${escapedName}(?![\\w:-])`).test(text),
    );
  });
  return [
    ...sources,
    ...invoked.map(([name, body]) => [`package.json#${name}`, body]),
  ];
}

export function checkCiTestMatrix(root = repoRoot) {
  const packages = surveyPackages(root);
  const sources = readLaneSources(root);
  const sourceText = new Map(sources);
  const missingOtherLanes = OTHER_LANES.filter(
    (entry) =>
      !entry.invocation.test(
        sourceText.get(`.github/workflows/${entry.workflow}`) ?? "",
      ),
  );
  if (missingOtherLanes.length > 0) {
    throw new Error(
      missingOtherLanes
        .map(
          (entry) =>
            `${entry.reason} — NO CI lane invocation found in ${entry.workflow}`,
        )
        .join("\n"),
    );
  }
  const lanes = detectLanes(sources, packages);
  const allowed = new Map(ALLOWLIST.map((entry) => [entry.dir, entry]));
  const submodules = readSubmodulePaths(root);

  const dark = [];
  const rows = [];
  for (const entry of packages) {
    if (submodules.has(entry.dir)) continue;
    if (entry.unit.length === 0 && entry.otherLane.length === 0) continue;
    const proof = lanes.get(entry.dir);
    const status = proof
      ? "CI"
      : entry.unit.length === 0
        ? "other lane"
        : allowed.has(entry.dir)
          ? "allowlisted"
          : "DARK";
    rows.push({ entry, status, proof });
    if (status === "DARK") dark.push(entry);
  }

  const width = Math.max(...rows.map((row) => row.entry.dir.length));
  for (const row of rows) {
    const counts = `${String(row.entry.unit.length).padStart(3)} unit`;
    const other =
      row.entry.otherLane.length > 0
        ? ` +${row.entry.otherLane.length} e2e`
        : "";
    const note =
      row.status === "allowlisted"
        ? ` — ${allowed.get(row.entry.dir).reason}`
        : "";
    console.log(
      `  ${row.status === "DARK" ? "✗" : "·"} ${row.entry.dir.padEnd(width)}  ${counts}${other}  [${row.status}]${note}`,
    );
  }

  // An allowlist entry that is no longer needed is rot — the exclusion outlives
  // the reason and the next reader believes it.
  const byDir = new Map(packages.map((entry) => [entry.dir, entry]));
  const stale = ALLOWLIST.flatMap((entry) => {
    const workspacePackage = byDir.get(entry.dir);
    const reason = !workspacePackage
      ? "package is gone"
      : workspacePackage.unit.length + workspacePackage.otherLane.length === 0
        ? "package has no test files"
        : lanes.has(entry.dir)
          ? "tests now run in CI"
          : null;
    return reason ? [{ ...entry, staleReason: reason }] : [];
  });
  if (stale.length > 0) {
    throw new Error(
      `ALLOWLIST in scripts/check-ci-test-matrix.mjs is stale:\n` +
        stale
          .map((entry) => `  ${entry.dir} — ${entry.staleReason}`)
          .join("\n") +
        "\nDelete the entries.",
    );
  }

  if (dark.length > 0) {
    const detail = dark
      .map(
        (entry) =>
          `  ${entry.dir} (${entry.name}) — ${entry.unit.length} test file(s), ` +
          `${entry.hasTestScript ? "has a `test` script" : "NO `test` script"}\n` +
          entry.unit
            .slice(0, 5)
            .map((file) => `      ${file}`)
            .join("\n") +
          (entry.unit.length > 5
            ? `\n      … ${entry.unit.length - 5} more`
            : ""),
      )
      .join("\n");
    throw new Error(
      `${dark.length} package(s) ship tests that NO CI lane runs (ruling R15):\n${detail}\n\n` +
        "Either wire them into .github/workflows/test.yml (the jest loop, the vitest loop, or a\n" +
        "dedicated step), or add an entry to ALLOWLIST in scripts/check-ci-test-matrix.mjs with a\n" +
        "reason — exclusions are allowed, silent exclusions are not.",
    );
  }
  console.log(
    `✓ every workspace package with tests runs in a CI lane (${rows.length} packages)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    checkCiTestMatrix();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
