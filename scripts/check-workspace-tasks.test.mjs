import test from "node:test";
import assert from "node:assert/strict";

import { checkWorkspaceTasks } from "./check-workspace-tasks.mjs";

const packageWithoutTypecheck = {
  dir: "packages/example",
  manifest: {
    name: "@wcpos/example",
    scripts: { lint: "eslint src" },
  },
};

test("rejects a workspace package with a missing task", () => {
  assert.throws(
    () => checkWorkspaceTasks([packageWithoutTypecheck], []),
    /packages\/example.*typecheck/,
  );
});

test("accepts a missing package task when the pair is allowlisted", () => {
  const allowlist = [
    {
      dir: "packages/example",
      tasks: ["typecheck"],
      reason: "fixture package intentionally has no TypeScript",
    },
  ];

  assert.doesNotThrow(() =>
    checkWorkspaceTasks([packageWithoutTypecheck], allowlist),
  );
});

test("rejects an allowlist entry with a blank reason", () => {
  const allowlist = [
    {
      dir: "packages/example",
      tasks: ["typecheck"],
      reason: "   ",
    },
  ];

  assert.throws(
    () => checkWorkspaceTasks([packageWithoutTypecheck], allowlist),
    /exclusions are allowed, silent exclusions are not/,
  );
});

test("rejects an allowlist entry when the package now declares the task", () => {
  const packageWithTypecheck = {
    ...packageWithoutTypecheck,
    manifest: {
      ...packageWithoutTypecheck.manifest,
      scripts: { lint: "eslint src", typecheck: "tsc --noEmit" },
    },
  };
  const allowlist = [
    {
      dir: "packages/example",
      tasks: ["typecheck"],
      reason: "fixture package used to lack TypeScript",
    },
  ];

  assert.throws(
    () => checkWorkspaceTasks([packageWithTypecheck], allowlist),
    /ALLOWLIST.*stale[^]*typecheck now declared/,
  );
});
