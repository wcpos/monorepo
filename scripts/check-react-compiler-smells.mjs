import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformFileSync } from '@babel/core';

// Resolve babel from the repo, not from whatever root is being audited, so a
// fixture tree in a temp dir compiles with the same preset and plugin as the app.
const require = createRequire(import.meta.url);
const PRESET_TYPESCRIPT = require.resolve('@babel/preset-typescript');
const PLUGIN_REACT_COMPILER = require.resolve('babel-plugin-react-compiler');

/**
 * Fails when the React Compiler skips a component or hook for a reason that is a
 * Rules-of-React violation rather than a compiler limitation.
 *
 * Why this is a script and not a lint rule: the app build compiles with
 * babel-plugin-react-compiler (apps/main app.config.ts `experiments.reactCompiler`),
 * while eslint-plugin-react-hooks bundles its own compiler copy and, measured on
 * 2026-09-02, reported none of these bailouts (only `exhaustive-deps` warnings) on
 * files the build compiler refuses. Only the build compiler's verdict counts, so
 * this runs the build compiler. The whole app tree compiles in about eight seconds.
 *
 * A skip is not a bug by itself: a skipped component renders exactly as it did
 * before the compiler existed. What this gate catches is the REASON. The reasons
 * below mean the code mutates something it must not, reads a ref during render, or
 * hand-wrote a memo dependency list the code does not honour — all of which are
 * stale-UI bugs in waiting whether or not the compiler is on (#1766 was the
 * shape of it: a debounce keyed on a callback identity the compiler had silently
 * stopped stabilising). Compiler todo-class reasons (try/finally, throw inside
 * try/catch, dynamic import, ...) are reported for information only.
 *
 * Deliberate opt-outs (`'use no memo'`, an API on the compiler's own incompatible
 * list with no tracked equivalent) go in ALLOWLIST with the reason.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Source roots the app build compiles. Test files and mocks are excluded. */
export const SOURCE_ROOTS = [
	'packages/core/src',
	'packages/components/src',
	'packages/query/src',
	'packages/hooks/src',
];

/** Skip reasons that are rules violations. Matched as prefixes of the compiler's message. */
export const SMELL_REASONS = [
	'This value cannot be modified',
	'Existing memoization could not be preserved',
	'Cannot access refs during render',
	'Use of incompatible library',
];

/**
 * Sites the compiler will always skip for a smell-class reason, on purpose.
 * Key: repo-relative file. Value: why it is allowed.
 */
export const ALLOWLIST = new Map([
	[
		'packages/components/src/virtualized-list/virtualized-list.web.tsx',
		"TanStack Virtual's useVirtualizer is on the compiler's incompatible list by design; the wrapper opts out with 'use no memo'.",
	],
]);

function walk(dir, out) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__mocks__')
				continue;
			walk(full, out);
		} else if (
			/\.(tsx?|jsx?)$/.test(entry.name) &&
			!/\.(test|spec|d)\.(tsx?|jsx?)$/.test(entry.name)
		) {
			out.push(full);
		}
	}
	return out;
}

/**
 * babel-plugin-react-compiler 1.0.0 event shape (measured): a CompileError carries
 * `fnLoc` (the whole function) and `detail.options.{reason, category, details[]}`,
 * where each detail has the precise `loc`. Older shapes put `reason` on `detail`.
 */
function reasonOf(event) {
	const detail = event.detail ?? {};
	const options = detail.options ?? {};
	return String(options.reason ?? detail.reason ?? event.reason ?? options.category ?? event.kind);
}

function lineOf(event) {
	const detail = event.detail ?? {};
	const options = detail.options ?? {};
	const loc = options.details?.[0]?.loc ?? options.loc ?? detail.loc ?? event.fnLoc;
	return loc?.start?.line ?? null;
}

/**
 * Compile every file under the roots and classify each skip.
 * Returns { compiled, smells: [{file, line, reason}], todos: Map<reason, count> }.
 */
export function auditReactCompiler(roots = SOURCE_ROOTS, root = repoRoot) {
	let compiled = 0;
	const smells = [];
	const todos = new Map();
	for (const relRoot of roots) {
		for (const file of walk(path.join(root, relRoot), [])) {
			const events = [];
			transformFileSync(file, {
				babelrc: false,
				configFile: false,
				presets: [[PRESET_TYPESCRIPT, { isTSX: true, allExtensions: true }]],
				plugins: [[PLUGIN_REACT_COMPILER, { logger: { logEvent: (_f, e) => events.push(e) } }]],
			});
			for (const event of events) {
				if (event.kind === 'CompileSuccess') {
					compiled += 1;
					continue;
				}
				if (event.kind !== 'CompileError' && event.kind !== 'CompileSkip') continue;
				const reason = reasonOf(event);
				const rel = path.relative(root, file);
				if (SMELL_REASONS.some((prefix) => reason.startsWith(prefix))) {
					smells.push({ file: rel, line: lineOf(event), reason });
				} else {
					const key = reason.replace(/\(BuildHIR::[^)]*\) /, '').slice(0, 80);
					todos.set(key, (todos.get(key) ?? 0) + 1);
				}
			}
		}
	}
	return { compiled, smells, todos };
}

function main() {
	const { compiled, smells, todos } = auditReactCompiler();
	const offending = smells.filter((s) => !ALLOWLIST.has(s.file));
	const unusedAllow = [...ALLOWLIST.keys()].filter((f) => !smells.some((s) => s.file === f));

	console.log(`react-compiler: ${compiled} functions compiled`);
	const todoTotal = [...todos.values()].reduce((a, b) => a + b, 0);
	console.log(
		`react-compiler: ${todoTotal} skips for compiler-limitation reasons (informational):`
	);
	for (const [reason, count] of [...todos.entries()].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${String(count).padStart(4)}  ${reason}`);
	}

	let failed = false;
	if (offending.length > 0) {
		failed = true;
		console.error(
			`\nreact-compiler: ${offending.length} skip(s) for Rules-of-React reasons. Fix the code (do not allowlist):`
		);
		for (const s of offending)
			console.error(`  ${s.file}${s.line ? `:${s.line}` : ''}  ${s.reason}`);
	}
	if (unusedAllow.length > 0) {
		failed = true;
		console.error(`\nALLOWLIST in scripts/check-react-compiler-smells.mjs is stale (no skip at):`);
		for (const f of unusedAllow) console.error(`  ${f}`);
	}
	if (failed) process.exit(1);
	console.log(
		`react-compiler: no Rules-of-React skips outside the ${ALLOWLIST.size}-entry allowlist`
	);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
