#!/usr/bin/env node
/**
 * Workspace task tripwire: Turbo skips undeclared package tasks silently.
 *
 * Two failure modes, both of which have happened:
 *   1. A package declares no `lint`/`typecheck` script, so `turbo lint` walks
 *      past it without a word.
 *   2. A package DOES declare the script, but the root `pnpm lint` filter list
 *      never selects it — so the task exists, passes locally when invoked by
 *      hand, and runs in no CI lane. `apps/template-studio` sat that way from
 *      the day it was added until 2026-08-29, accumulating a real
 *      `no-misused-promises` error that nothing was ever going to catch. The
 *      CI planner (scripts/ci-plan.mjs) already routed its changes to the Lint
 *      job; only the filter list was missing, so the job ran and reported green
 *      without looking at the changed files.
 *
 * Exclusions are allowed; silent exclusions are not. Every entry in either
 * allowlist needs a reason, and both are checked for staleness so a fixed
 * exclusion cannot outlive the problem it documented.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSubmodulePaths } from './check-ci-test-matrix.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REQUIRED_TASKS = ['lint', 'typecheck'];

/** Workspace roots from pnpm-workspace.yaml. Submodules are dropped separately. */
const WORKSPACE_PARENTS = ['apps', 'packages'];

export const ALLOWLIST = [
	{
		dir: 'packages/virtual-printer',
		tasks: ['lint', 'typecheck'],
		reason: 'plain .mjs with no TypeScript and no eslint config of its own',
	},
	{
		dir: 'packages/eslint',
		tasks: ['typecheck'],
		reason: 'eslint config package itself, plain .js',
	},
];

/**
 * Packages that declare a task the root gate deliberately does not run. Empty
 * is the goal state: a task outside the gate is a task nobody runs.
 */
export const GATE_ALLOWLIST = [];

export function readWorkspacePackages(root = repoRoot) {
	const submodules = readSubmodulePaths(root);
	const dirs = WORKSPACE_PARENTS.flatMap((parent) =>
		readdirSync(path.join(root, parent), { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
			.map((entry) => `${parent}/${entry.name}`)
	);

	return dirs
		.filter((dir) => !submodules.has(dir) && existsSync(path.join(root, dir, 'package.json')))
		.sort()
		.map((dir) => ({
			dir,
			manifest: JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8')),
		}));
}

export function readRootScripts(root = repoRoot) {
	return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {};
}

/** Reasonless entries are the thing this whole file exists to prevent. */
function assertReasons(allowlist, source) {
	const silent = allowlist.filter((entry) => !entry.reason?.trim());
	if (silent.length === 0) return;
	throw new Error(
		`${source} in scripts/check-workspace-tasks.mjs has silent exclusions:\n` +
			silent.map((entry) => `  ${entry.dir}`).join('\n') +
			'\nAdd a reason — exclusions are allowed, silent exclusions are not.'
	);
}

function assertNotStale(stale, source) {
	if (stale.length === 0) return;
	throw new Error(
		`${source} in scripts/check-workspace-tasks.mjs is stale:\n` +
			stale.map((entry) => `  ${entry.dir} — ${entry.staleReason}`).join('\n') +
			'\nDelete the stale package/task pairs.'
	);
}

function allowedPairs(allowlist) {
	return new Set(allowlist.flatMap(({ dir, tasks }) => tasks.map((task) => `${dir}:${task}`)));
}

export function checkWorkspaceTasks(packages = readWorkspacePackages(), allowlist = ALLOWLIST) {
	assertReasons(allowlist, 'ALLOWLIST');

	const byDir = new Map(packages.map((entry) => [entry.dir, entry]));
	assertNotStale(
		allowlist.flatMap((entry) => {
			const workspacePackage = byDir.get(entry.dir);
			if (!workspacePackage) return [{ ...entry, staleReason: 'package is gone' }];
			return entry.tasks
				.filter((task) => workspacePackage.manifest.scripts?.[task])
				.map((task) => ({ ...entry, staleReason: `${task} now declared` }));
		}),
		'ALLOWLIST'
	);

	const allowed = allowedPairs(allowlist);
	const missing = packages.flatMap(({ dir, manifest }) =>
		REQUIRED_TASKS.filter(
			(task) => !manifest.scripts?.[task] && !allowed.has(`${dir}:${task}`)
		).map((task) => ({ dir, name: manifest.name, task }))
	);

	if (missing.length === 0) return;

	throw new Error(
		`${missing.length} workspace task(s) are missing:\n` +
			missing.map(({ dir, name, task }) => `  ${dir} (${name}) — ${task}`).join('\n') +
			'\n\nAdd the script or document the package/task pair in ALLOWLIST in ' +
			'scripts/check-workspace-tasks.mjs.'
	);
}

/**
 * Workspace directories a root script's `--filter='{./…}'` list selects.
 * Only the two shapes this repo uses are understood — a literal directory and
 * one trailing `/*`. Anything else throws rather than under-matching, because a
 * filter this cannot read would report packages as uncovered when they are, or
 * (worse) covered when they are not.
 */
export function parseTurboFilters(script) {
	return [...script.matchAll(/--filter=(['"]?)\{(?:\.\/)?([^}]+)\}\1/g)].map((match) => {
		const glob = match[2];
		if (/[*?[\]{}]/.test(glob) && !/^[^*?[\]{}]+\/\*$/.test(glob)) {
			throw new Error(
				`Unsupported turbo filter \`${glob}\` in root package.json — use a literal ` +
					'directory or one trailing /*, or teach parseTurboFilters the new shape.'
			);
		}
		return glob;
	});
}

export function isCoveredByFilters(dir, filters) {
	return filters.some((filter) =>
		filter.endsWith('/*') ? path.dirname(dir) === filter.slice(0, -2) : dir === filter
	);
}

export function checkGateCoverage(
	packages = readWorkspacePackages(),
	rootScripts = readRootScripts(),
	allowlist = GATE_ALLOWLIST
) {
	assertReasons(allowlist, 'GATE_ALLOWLIST');

	const filtersByTask = new Map();
	for (const task of REQUIRED_TASKS) {
		const script = rootScripts[task];
		if (!script) {
			throw new Error(
				`Root package.json declares no \`${task}\` script — the ${task} gate cannot run.`
			);
		}
		const filters = parseTurboFilters(script);
		if (filters.length === 0) {
			throw new Error(
				`Root \`${task}\` script has no --filter='{./…}' selectors, so this check cannot ` +
					'tell which packages it reaches. Add filters or teach parseTurboFilters the new shape.'
			);
		}
		filtersByTask.set(task, filters);
	}

	const byDir = new Map(packages.map((entry) => [entry.dir, entry]));
	assertNotStale(
		allowlist.flatMap((entry) => {
			const workspacePackage = byDir.get(entry.dir);
			if (!workspacePackage) return [{ ...entry, staleReason: 'package is gone' }];
			return entry.tasks
				.filter(
					(task) =>
						!workspacePackage.manifest.scripts?.[task] ||
						isCoveredByFilters(entry.dir, filtersByTask.get(task) ?? [])
				)
				.map((task) => ({
					...entry,
					staleReason: workspacePackage.manifest.scripts?.[task]
						? `${task} is now in the gate`
						: `${task} is no longer declared`,
				}));
		}),
		'GATE_ALLOWLIST'
	);

	const allowed = allowedPairs(allowlist);
	const uncovered = packages.flatMap(({ dir, manifest }) =>
		REQUIRED_TASKS.filter(
			(task) =>
				manifest.scripts?.[task] &&
				!isCoveredByFilters(dir, filtersByTask.get(task)) &&
				!allowed.has(`${dir}:${task}`)
		).map((task) => ({ dir, name: manifest.name, task }))
	);

	if (uncovered.length === 0) return;

	throw new Error(
		`${uncovered.length} workspace task(s) are declared but outside the root gate:\n` +
			uncovered.map(({ dir, name, task }) => `  ${dir} (${name}) — ${task}`).join('\n') +
			"\n\nAdd --filter='{./<dir>}' to the matching root package.json script, or document " +
			'the package/task pair in GATE_ALLOWLIST in scripts/check-workspace-tasks.mjs.'
	);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const packages = readWorkspacePackages();
		checkWorkspaceTasks(packages);
		checkGateCoverage(packages, readRootScripts());
		console.log(
			`✓ every workspace package declares lint and typecheck tasks, and the root gate ` +
				`runs them (${packages.length} packages)`
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
