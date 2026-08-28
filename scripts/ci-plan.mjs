#!/usr/bin/env node
/** Conservative, change-aware CI routing for pull requests. */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const UNIT_PACKAGES = new Set([
	'core',
	'components',
	'database',
	'hooks',
	'utils',
	'order-math',
	'resizable-panels',
	'query',
	'sync-core',
	'sync-engine',
	'printer',
	'receipt-renderer',
	'scanner',
	'main',
]);
const WEB_SPEC = /^apps\/main\/e2e\/([A-Za-z0-9._-]+\.spec\.ts)$/;

export function classify(file) {
	if (
		/\.(md|mdx)$/.test(file) ||
		file.startsWith('docs/') ||
		file.startsWith('.claude/') ||
		/^LICENSE[^/]*$/.test(file) ||
		file === '.gitignore' ||
		file === '.editorconfig'
	)
		return 'docs';
	if (file.startsWith('apps/main/.maestro/')) return 'maestro';
	const spec = WEB_SPEC.exec(file);
	if (
		spec &&
		!spec[1].endsWith('.cold.spec.ts') &&
		!spec[1].endsWith('.live.spec.ts') &&
		!spec[1].endsWith('.unit.spec.ts')
	)
		return 'web-spec';
	if (
		file.startsWith('apps/main/e2e/') ||
		file === 'apps/main/playwright.config.ts' ||
		file.startsWith('apps/main/scripts/')
	)
		return 'web-helper';
	if (
		!file.startsWith('scripts/') &&
		(/\.test\.(ts|tsx|js|mjs|cjs)$/.test(file) || file.includes('/__tests__/'))
	)
		return 'unit-test-file';
	if (
		file.startsWith('packages/virtual-printer/') ||
		file.startsWith('packages/eslint/') ||
		file.startsWith('apps/template-studio/')
	)
		return 'leaf-package';
	// Native inputs must win before the generic apps/main rule.
	if (
		/^apps\/main\/app\.config\.[^/]+$/.test(file) ||
		file.startsWith('apps/main/plugins/') ||
		file.startsWith('apps/main/modules/') ||
		file === 'apps/main/eas.json' ||
		file === 'apps/main/package.json'
	)
		return 'native-config';
	if (/^packages\/[^/]+\//.test(file)) return 'package-src';
	if (file.startsWith('apps/main/')) return 'app-src';
	if (
		['pnpm-lock.yaml', 'package.json', 'turbo.json', 'pnpm-workspace.yaml', '.npmrc'].includes(
			file
		) ||
		file.startsWith('patches/')
	)
		return 'root-deps';
	if (file === 'tsconfig.json') return 'root-tsconfig';
	if (file === 'jest.config.js') return 'root-jest';
	if (/^(prettier|eslint)\.config\.[^/]+$/.test(file)) return 'root-format';
	if (/^\.github\/workflows\/[^/]+\.yml$/.test(file)) return 'workflow';
	if (file.startsWith('.github/actions/') || file.startsWith('.github/scripts/'))
		return 'github-shared';
	if (file.startsWith('scripts/')) return 'scripts';
	if (file === 'apps/web' || file === 'apps/electron') return 'submodule';
	return 'fallback';
}

function everythingPlan(detail) {
	return {
		lint: true,
		unit: 'all',
		web: 'full',
		only_specs: '',
		native: 'cachehit',
		self: '',
		reason: `lint ran: ${detail}; unit ran all: ${detail}; web ran full: ${detail}; native ran cachehit: ${detail}`,
	};
}

function workspaceGraph() {
	const yaml = readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
	const block = /^packages:\s*\n((?:\s+-[^\n]*\n?)*)/m.exec(yaml);
	const globs = [...(block?.[1] ?? '').matchAll(/^\s*-\s*["']?([^"'\s#]+)["']?/gm)].map(
		(match) => match[1]
	);
	const dirs = [];
	for (const glob of globs) {
		if (glob.endsWith('/*')) {
			const parent = glob.slice(0, -2);
			for (const entry of readdirSync(path.join(ROOT, parent), { withFileTypes: true })) {
				if (entry.isDirectory() && existsSync(path.join(ROOT, parent, entry.name, 'package.json')))
					dirs.push(`${parent}/${entry.name}`);
			}
		} else if (existsSync(path.join(ROOT, glob, 'package.json'))) dirs.push(glob);
	}
	const manifests = dirs.map((dir) => ({
		dir,
		manifest: JSON.parse(readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8')),
	}));
	const byName = new Map(manifests.map(({ dir, manifest }) => [manifest.name, path.basename(dir)]));
	const reverse = new Map();
	for (const { dir, manifest } of manifests) {
		const dependant = path.basename(dir);
		const dependencies = {
			...manifest.dependencies,
			...manifest.devDependencies,
			...manifest.peerDependencies,
		};
		for (const name of Object.keys(dependencies)) {
			const dependency = byName.get(name);
			if (!dependency) continue;
			if (!reverse.has(dependency)) reverse.set(dependency, new Set());
			reverse.get(dependency).add(dependant);
		}
	}
	return reverse;
}

function affectedUnits(packageName) {
	const reverse = workspaceGraph();
	const affected = new Set([packageName]);
	const queue = [packageName];
	while (queue.length) {
		for (const dependant of reverse.get(queue.shift()) ?? []) {
			if (affected.has(dependant)) continue;
			affected.add(dependant);
			queue.push(dependant);
		}
	}
	return [...affected].filter((name) => UNIT_PACKAGES.has(name)).sort();
}

function reasonFor(plan, reasons) {
	const why = (tier) => [...reasons[tier]].sort().join(', ') || 'no changed file requires it';
	return [
		plan.lint ? `lint ran: ${why('lint')}` : `lint skipped: ${why('lint')}`,
		plan.unit === 'none' ? `unit skipped: ${why('unit')}` : `unit ran ${plan.unit}: ${why('unit')}`,
		plan.web === 'none' ? `web skipped: ${why('web')}` : `web ran ${plan.web}: ${why('web')}`,
		plan.native === 'none'
			? `native skipped: ${why('native')}`
			: `native ran ${plan.native}: ${why('native')}`,
	].join('; ');
}

export function planFor(changedFiles, { commentOnly = false } = {}) {
	try {
		if (!changedFiles.length) return everythingPlan('no changed files detected');
		const rules = changedFiles.map((file) => classify(file));
		const nonBehavioural = changedFiles.every(
			(file, index) => rules[index] === 'docs' || (commentOnly && CODE_EXTENSIONS.test(file))
		);
		if (nonBehavioural) {
			const detail = 'only documentation or comment-only code changed';
			return {
				lint: false,
				unit: 'none',
				web: 'none',
				only_specs: '',
				native: 'none',
				self: '',
				reason: `lint skipped: ${detail}; unit skipped: ${detail}; web skipped: ${detail}; native skipped: ${detail}`,
			};
		}
		const fallback = rules.indexOf('fallback');
		if (fallback !== -1) return everythingPlan(`${changedFiles[fallback]} matched no rule`);

		const plan = {
			lint: false,
			unit: 'none',
			web: 'none',
			only_specs: '',
			native: 'none',
			self: '',
		};
		const units = new Set();
		const specs = new Set();
		const selves = new Set();
		const reasons = { lint: new Set(), unit: new Set(), web: new Set(), native: new Set() };
		const rank = { none: 0, narrowed: 1, cachehit: 1, full: 2, rebuild: 2 };
		const widen = (tier, value, rule) => {
			if (rank[value] > rank[plan[tier]]) plan[tier] = value;
			reasons[tier].add(rule);
		};
		const lint = (rule) => {
			plan.lint = true;
			reasons.lint.add(rule);
		};
		const all = (rule) => {
			lint(rule);
			plan.unit = 'all';
			reasons.unit.add(rule);
			widen('web', 'full', rule);
			widen('native', 'cachehit', rule);
		};

		for (let index = 0; index < changedFiles.length; index++) {
			const file = changedFiles[index];
			const rule = rules[index];
			if (rule === 'docs') continue;
			if (rule === 'github-shared') {
				all(rule);
				continue;
			}
			lint(rule);
			if (rule === 'maestro') widen('native', 'cachehit', rule);
			else if (rule === 'web-spec') {
				widen('web', 'narrowed', rule);
				specs.add(path.basename(file));
			} else if (rule === 'web-helper') widen('web', 'full', rule);
			else if (rule === 'unit-test-file') {
				const match = /^(?:packages\/([^/]+)|apps\/main)\//.exec(file);
				if (!match) plan.unit = 'all';
				else units.add(match[1] ?? 'main');
				reasons.unit.add(rule);
			} else if (rule === 'package-src') {
				for (const name of affectedUnits(file.split('/')[1])) units.add(name);
				reasons.unit.add(rule);
				widen('web', 'full', rule);
				widen('native', 'cachehit', rule);
			} else if (rule === 'app-src') {
				units.add('main');
				reasons.unit.add(rule);
				widen('web', 'full', rule);
				widen('native', 'cachehit', rule);
			} else if (rule === 'native-config') {
				units.add('main');
				reasons.unit.add(rule);
				widen('web', 'full', rule);
				widen('native', 'rebuild', rule);
			} else if (rule === 'root-deps') all(rule);
			else if (rule === 'root-tsconfig') {
				plan.unit = 'all';
				reasons.unit.add(rule);
				widen('web', 'full', rule);
			} else if (rule === 'root-jest') {
				plan.unit = 'all';
				reasons.unit.add(rule);
			} else if (rule === 'workflow') {
				const name = path.basename(file, '.yml');
				selves.add(name);
				if (name === 'deploy') widen('web', 'full', rule);
				if (name === 'test') {
					plan.unit = 'all';
					reasons.unit.add(rule);
				}
				if (name === 'e2e-native') widen('native', 'cachehit', rule);
			} else if (rule === 'scripts') {
				if (file === 'scripts/e2e-native-seed.mjs') widen('native', 'cachehit', rule);
				else if (!/^scripts\/(?:check-.*\.mjs|[^/]+\.test\.mjs)$/.test(file)) all(rule);
			}
		}
		if (plan.unit !== 'all' && units.size) plan.unit = [...units].sort().join(',');
		if (plan.web === 'narrowed') plan.only_specs = [...specs].sort().join(' ');
		plan.self = [...selves].sort().join(',');
		plan.reason = reasonFor(plan, reasons);
		return plan;
	} catch (error) {
		return everythingPlan(
			`planner error: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function isCommentOnlyLine(content) {
	if (content.startsWith('//')) return true;
	if (content.startsWith('/*')) {
		const closed = content.lastIndexOf('*/');
		if (closed === -1) return false;
		return content.slice(closed + 2).trim() === '';
	}
	if (content.includes('*/')) return false;
	return false;
}

function isNonBehavioural(changed, baseRef) {
	if (!changed.every((file) => /\.(md|mdx)$/.test(file) || CODE_EXTENSIONS.test(file)))
		return false;
	const hunks = spawnSync('git', ['diff', '--no-renames', '-U0', `${baseRef}...HEAD`, '--'], {
		encoding: 'utf8',
	});
	if (hunks.status !== 0) return false;
	let file = '';
	for (const line of hunks.stdout.split('\n')) {
		if (line.startsWith('--- a/')) {
			file = line.slice(6).trim();
			continue;
		}
		if (line.startsWith('+++ b/')) {
			file = line.slice(6).trim();
			continue;
		}
		if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;
		if (!line.startsWith('+') && !line.startsWith('-')) continue;
		if (/\.(md|mdx)$/.test(file)) continue;
		const content = line.slice(1).trim();
		if (content === '') continue;
		if (!isCommentOnlyLine(content)) return false;
	}
	return true;
}

function emit(plan) {
	console.error(`[ci-plan] ${plan.reason}`);
	// $GITHUB_OUTPUT is one `key=value` per line; a newline inside a value (a
	// multi-line git error in `reason`) would corrupt the file and fail the
	// changes job instead of falling back to the everything-plan.
	for (const key of ['lint', 'unit', 'web', 'only_specs', 'native', 'self', 'reason'])
		console.log(`${key}=${String(plan[key]).replace(/[\r\n]+/g, ' ')}`);
}

function main() {
	try {
		const baseRef = process.argv[2];
		if (process.env.GITHUB_EVENT_NAME !== 'pull_request')
			return emit(
				everythingPlan(`event is ${process.env.GITHUB_EVENT_NAME || 'unset'}, not pull_request`)
			);
		if (!baseRef) return emit(everythingPlan('no base SHA'));
		const diff = spawnSync('git', ['diff', '--no-renames', '--name-only', `${baseRef}...HEAD`], {
			encoding: 'utf8',
		});
		if (diff.status !== 0)
			return emit(
				everythingPlan(`git diff against ${baseRef} failed: ${(diff.stderr || '').trim()}`)
			);
		const changed = diff.stdout
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		if (!changed.length) return emit(everythingPlan('git diff returned no changed files'));
		emit(planFor(changed, { commentOnly: isNonBehavioural(changed, baseRef) }));
	} catch (error) {
		emit(
			everythingPlan(`planner error: ${error instanceof Error ? error.message : String(error)}`)
		);
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
