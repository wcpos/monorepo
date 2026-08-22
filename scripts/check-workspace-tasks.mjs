#!/usr/bin/env node
/** Workspace task tripwire: Turbo skips undeclared package tasks silently. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readSubmodulePaths } from "./check-ci-test-matrix.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const REQUIRED_TASKS = ["lint", "typecheck"];

export const ALLOWLIST = [
  {
    dir: "packages/virtual-printer",
    tasks: ["lint", "typecheck"],
    reason: "plain .mjs with no TypeScript and no eslint config of its own",
  },
  {
    dir: "packages/eslint",
    tasks: ["typecheck"],
    reason: "eslint config package itself, plain .js",
  },
  {
    dir: "packages/printer",
    tasks: ["lint"],
    reason:
      "TODO(#PRINTER-LINT): 119 eslint findings (111 prettier autofixable, 8 rule violations) must be cleared before this can be wired",
  },
];

export function readWorkspacePackages(root = repoRoot) {
  const submodules = readSubmodulePaths(root);
  const dirs = readdirSync(path.join(root, "packages"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => `packages/${entry.name}`);
  dirs.push("apps/main");

  return dirs
    .filter(
      (dir) =>
        !submodules.has(dir) &&
        existsSync(path.join(root, dir, "package.json")),
    )
    .sort()
    .map((dir) => ({
      dir,
      manifest: JSON.parse(
        readFileSync(path.join(root, dir, "package.json"), "utf8"),
      ),
    }));
}

export function checkWorkspaceTasks(
  packages = readWorkspacePackages(),
  allowlist = ALLOWLIST,
) {
  const silent = allowlist.filter((entry) => !entry.reason?.trim());
  if (silent.length > 0) {
    throw new Error(
      `ALLOWLIST in scripts/check-workspace-tasks.mjs has silent exclusions:\n` +
        silent.map((entry) => `  ${entry.dir}`).join("\n") +
        "\nAdd a reason — exclusions are allowed, silent exclusions are not.",
    );
  }

  const byDir = new Map(packages.map((entry) => [entry.dir, entry]));
  const stale = allowlist.flatMap((entry) => {
    const workspacePackage = byDir.get(entry.dir);
    if (!workspacePackage) {
      return [{ ...entry, staleReason: "package is gone" }];
    }
    return entry.tasks
      .filter((task) => workspacePackage.manifest.scripts?.[task])
      .map((task) => ({ ...entry, staleReason: `${task} now declared` }));
  });
  if (stale.length > 0) {
    throw new Error(
      `ALLOWLIST in scripts/check-workspace-tasks.mjs is stale:\n` +
        stale
          .map((entry) => `  ${entry.dir} — ${entry.staleReason}`)
          .join("\n") +
        "\nDelete the stale package/task pairs.",
    );
  }

  const allowed = new Set(
    allowlist.flatMap(({ dir, tasks }) =>
      tasks.map((task) => `${dir}:${task}`),
    ),
  );
  const missing = packages.flatMap(({ dir, manifest }) =>
    REQUIRED_TASKS.filter(
      (task) => !manifest.scripts?.[task] && !allowed.has(`${dir}:${task}`),
    ).map((task) => ({ dir, name: manifest.name, task })),
  );

  if (missing.length === 0) return;

  throw new Error(
    `${missing.length} workspace task(s) are missing:\n` +
      missing
        .map(({ dir, name, task }) => `  ${dir} (${name}) — ${task}`)
        .join("\n") +
      "\n\nAdd the script or document the package/task pair in ALLOWLIST in " +
      "scripts/check-workspace-tasks.mjs.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const packages = readWorkspacePackages();
    checkWorkspaceTasks(packages);
    console.log(
      `✓ every workspace package declares lint and typecheck tasks (${packages.length} packages)`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
