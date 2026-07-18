#!/usr/bin/env node
/**
 * Maestro testID drift lint (native E2E spec, wayfinder #688 / decision #694).
 *
 * Every `id:` referenced in apps/main/.maestro/ flows must exist as a testID
 * in application source, so YAML flows can't silently drift from the app.
 * Dynamic ids are supported on both sides:
 *   - flow ids may end in a regex tail (e.g. "store-option-.*") — matched by prefix
 *   - source testIDs may be template literals (e.g. `open-order-tab-${id}`) — matched by prefix
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const maestroDir = path.join(repoRoot, 'apps/main/.maestro');
const sourceDirs = ['packages/core/src', 'packages/components/src', 'apps/main/app'].map((p) =>
	path.join(repoRoot, p)
);

function walk(dir, exts, files = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, exts, files);
		else if (exts.some((e) => entry.name.endsWith(e))) files.push(full);
	}
	return files;
}

// 1. Collect ids referenced by flows.
const flowIds = new Set();
for (const file of walk(maestroDir, ['.yml', '.yaml'])) {
	const text = fs.readFileSync(file, 'utf8');
	for (const match of text.matchAll(/^\s*id:\s*["']?([^"'\n]+?)["']?\s*$/gm)) {
		flowIds.add(match[1].trim());
	}
}

// 2. Collect testIDs defined in source: literals and template-literal prefixes.
const literals = new Set();
const prefixes = new Set();
for (const dir of sourceDirs) {
	for (const file of walk(dir, ['.tsx', '.ts'])) {
		if (file.endsWith('.web.tsx') || file.endsWith('.web.ts')) continue;
		// Test-only literals must not satisfy the lint — a removed production
		// testID would otherwise stay "present" via its unit test.
		if (/\.(test|spec)\.[jt]sx?$/.test(file) || file.includes('__tests__')) continue;
		const text = fs.readFileSync(file, 'utf8');
		// Any *TestID prop (testID, removeTestID, screenTestID, …), string literal value.
		for (const m of text.matchAll(/\w*[tT]estID\s*[=:]\s*\{?\s*["']([^"']+)["']/g)) {
			literals.add(m[1]);
		}
		// Template-literal values, including inside short expressions (ternaries).
		for (const m of text.matchAll(/\w*[tT]estID\s*[=:][^`\n]{0,80}`([^`]+)`/g)) {
			const template = m[1];
			const dynamicStart = template.indexOf('${');
			if (dynamicStart > 0) prefixes.add(template.slice(0, dynamicStart));
			else if (dynamicStart === -1) literals.add(template);
		}
	}
}

// 3. Match: exact literal, or dynamic-tail flow id / template prefix overlap.
const missing = [];
for (const flowId of flowIds) {
	const regexTail = flowId.match(/^(.*?)(\.\*|\[|\(|\\d)/); // id ends in a regex construct
	const wanted = regexTail ? regexTail[1] : flowId;
	const ok =
		literals.has(wanted) ||
		(regexTail
			? [...literals, ...prefixes].some((s) => s.startsWith(wanted))
			: [...prefixes].some((p) => wanted.startsWith(p)));
	if (!ok) missing.push(flowId);
}

if (missing.length) {
	console.error('✖ Maestro flows reference testIDs missing from source:');
	for (const id of missing.sort()) console.error(`  - ${id}`);
	process.exit(1);
}
console.log(`✔ All ${flowIds.size} Maestro-referenced testIDs exist in source.`);
