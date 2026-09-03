import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { classify, planFor } from './ci-plan.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'ci-plan.mjs');

function outputOf(result) {
	assert.equal(result.status, 0, result.stderr);
	return Object.fromEntries(
		result.stdout
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const split = line.indexOf('=');
				return [line.slice(0, split), line.slice(split + 1)];
			})
	);
}

/** Build a throwaway repo with a base commit and one PR commit on top. */
function planFromDiff(mutate, env = {}) {
	const repo = mkdtempSync(path.join(tmpdir(), 'ci-plan-'));
	const git = (...args) => {
		const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
		if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
	};
	try {
		git('init', '-q', '-b', 'main');
		git('config', 'user.email', 'test@example.invalid');
		git('config', 'user.name', 'Test');
		mkdirSync(path.join(repo, 'apps/main/e2e'), { recursive: true });
		mkdirSync(path.join(repo, 'packages/core/src'), { recursive: true });
		writeFileSync(path.join(repo, 'apps/main/e2e/products.spec.ts'), 'test("a", () => {});\n');
		writeFileSync(path.join(repo, 'apps/main/e2e/orders.spec.ts'), 'test("b", () => {});\n');
		writeFileSync(path.join(repo, 'apps/main/e2e/fixtures.ts'), 'export const helper = 1;\n');
		writeFileSync(
			path.join(repo, 'packages/core/src/index.ts'),
			'// header\nexport const x = {\n};\n'
		);
		writeFileSync(path.join(repo, 'README.md'), '# docs\n');
		git('add', '-A');
		git('commit', '-qm', 'base');
		git('branch', 'base-ref');

		mutate({
			repo,
			write: writeFileSync,
			append: appendFileSync,
			join: (relative) => path.join(repo, relative),
		});
		git('add', '-A');
		git('commit', '-qm', 'pr');

		return outputOf(
			spawnSync('node', [SCRIPT, 'base-ref'], {
				cwd: repo,
				encoding: 'utf8',
				env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', ...env },
			})
		);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
}

test('a comment-only source change skips every tier', () => {
	const plan = planFromDiff(({ append, join }) =>
		append(join('packages/core/src/index.ts'), '// note\n')
	);
	assert.deepEqual(
		[plan.lint, plan.unit, plan.web, plan.native],
		['false', 'none', 'none', 'none']
	);
});

test('a markdown-only change skips every tier', () => {
	const plan = planFromDiff(({ append, join }) => append(join('README.md'), 'more prose\n'));
	assert.equal(plan.lint, 'false');
});

test('renaming source code to a documentation path remains behavioural', () => {
	const plan = planFromDiff(({ repo }) => {
		mkdirSync(path.join(repo, 'docs'), { recursive: true });
		renameSync(path.join(repo, 'packages/core/src/index.ts'), path.join(repo, 'docs/index.md'));
	});
	assert.equal(plan.lint, 'true');
	assert.equal(plan.web, 'full');
});

test('deleting source code alongside a markdown edit remains behavioural', () => {
	const plan = planFromDiff(({ append, join }) => {
		append(join('README.md'), 'more prose\n');
		rmSync(join('packages/core/src/index.ts'));
	});
	assert.equal(plan.lint, 'true');
	assert.equal(plan.web, 'full');
});

for (const [name, line] of [
	['real code next to a comment', '// comment\nexport const y = 2;\n'],
	['a string that merely looks like a comment', 'export const url = "https://x.test";\n'],
	['a closed block comment followed by code', '/* note */ export const danger = 1;\n'],
]) {
	test(`${name} is behavioural`, () => {
		const plan = planFromDiff(({ append, join }) =>
			append(join('packages/core/src/index.ts'), line)
		);
		assert.equal(plan.lint, 'true');
		assert.equal(plan.web, 'full');
	});
}

test('a generator method line is not comment-only', () => {
	const plan = planFromDiff(({ write, join }) =>
		write(
			join('packages/core/src/index.ts'),
			'// header\nexport const x = {\n *danger() { yield 1; },\n};\n'
		)
	);
	assert.equal(plan.web, 'full');
});

test('block delimiters around unchanged code run the full suite', () => {
	const plan = planFromDiff(({ write, join }) =>
		write(join('packages/core/src/index.ts'), '// header\n/*\nexport const x = {\n};\n*/\n')
	);
	assert.equal(plan.web, 'full');
});

test('a multi-line block comment conservatively runs the full suite', () => {
	const plan = planFromDiff(({ append, join }) =>
		append(join('packages/core/src/index.ts'), '/* opening a block\n * more\n */\n')
	);
	assert.equal(plan.web, 'full');
});

test('a spec basename with regex metacharacters refuses to narrow', () => {
	const plan = planFromDiff(({ write, join }) =>
		write(join('apps/main/e2e/we(ird).spec.ts'), 'test("x", () => {});\n')
	);
	assert.equal(plan.web, 'full');
	assert.equal(plan.only_specs, '');
});

test('spec-only changes narrow to sorted spec basenames', () => {
	const plan = planFromDiff(({ append, join }) => {
		append(join('apps/main/e2e/products.spec.ts'), 'test("c", () => {});\n');
		append(join('apps/main/e2e/orders.spec.ts'), 'test("d", () => {});\n');
	});
	assert.equal(plan.web, 'narrowed');
	assert.equal(plan.only_specs, 'orders.spec.ts products.spec.ts');
});

test('a merge checkout excludes base branch movement from the plan', () => {
	const repo = mkdtempSync(path.join(tmpdir(), 'ci-plan-merge-'));
	const git = (...args) => {
		const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
		assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
		return result.stdout.trim();
	};
	try {
		git('init', '-q', '-b', 'main');
		git('config', 'user.email', 'test@example.invalid');
		git('config', 'user.name', 'Test');
		mkdirSync(path.join(repo, 'apps/main/e2e'), { recursive: true });
		writeFileSync(path.join(repo, 'apps/main/e2e/products.spec.ts'), 'test("a", () => {});\n');
		writeFileSync(path.join(repo, 'apps/main/package.json'), '{"version":"1.0.0"}\n');
		git('add', '-A');
		git('commit', '-qm', 'base');
		const staleBase = git('rev-parse', 'HEAD');

		git('switch', '-qc', 'pr');
		appendFileSync(path.join(repo, 'apps/main/e2e/products.spec.ts'), 'test("b", () => {});\n');
		git('commit', '-qam', 'pr');
		git('switch', '-q', 'main');
		writeFileSync(path.join(repo, 'apps/main/package.json'), '{"version":"1.0.1"}\n');
		git('commit', '-qam', 'main moved');
		git('merge', '--no-ff', '-qm', 'test merge', 'pr');

		const staleFiles = git('diff', '--name-only', `${staleBase}...HEAD`).split('\n');
		assert.ok(staleFiles.includes('apps/main/package.json'));
		const plan = outputOf(
			spawnSync('node', [SCRIPT, staleBase], {
				cwd: repo,
				encoding: 'utf8',
				env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request' },
			})
		);
		assert.equal(plan.native, 'none');
		assert.equal(plan.web, 'narrowed');
		assert.equal(plan.only_specs, 'products.spec.ts');
		assert.match(plan.reason, /range: merge-parents/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('touching an E2E helper widens a spec change to full', () => {
	const plan = planFromDiff(({ append, join }) => {
		append(join('apps/main/e2e/fixtures.ts'), 'export const other = 2;\n');
		append(join('apps/main/e2e/products.spec.ts'), 'test("e", () => {});\n');
	});
	assert.equal(plan.web, 'full');
	assert.equal(plan.only_specs, '');
});

test('one representative path exercises every ordered rule', () => {
	const cases = [
		['README.md', 'docs', { lint: false, unit: 'none', web: 'none', native: 'none' }],
		['apps/main/.maestro/sale.yaml', 'maestro', { lint: true, native: 'cachehit' }],
		['apps/main/e2e/orders.spec.ts', 'web-spec', { web: 'narrowed' }],
		['apps/main/e2e/fixtures.ts', 'web-helper', { web: 'full' }],
		['packages/core/src/x.test.ts', 'unit-test-file', { unit: 'core' }],
		['packages/virtual-printer/src/x.ts', 'leaf-package', { unit: 'none' }],
		['packages/core/src/polyfills.ts', 'native-source', { native: 'cachehit' }],
		['packages/core/package.json', 'package-deps', { native: 'rebuild' }],
		['packages/utils/src/x.ts', 'package-src', { web: 'full', native: 'none' }],
		['apps/main/src/x.ts', 'app-src', { unit: 'main', web: 'full', native: 'none' }],
		['apps/main/app.config.ts', 'native-config', { native: 'rebuild' }],
		['apps/main/modules/scanner/android/build.gradle', 'native-config', { native: 'rebuild' }],
		['pnpm-lock.yaml', 'root-deps', { unit: 'all', web: 'full', native: 'rebuild' }],
		['tsconfig.json', 'root-tsconfig', { unit: 'all', web: 'full' }],
		['jest.config.js', 'root-jest', { unit: 'all', web: 'none' }],
		['prettier.config.mjs', 'root-format', { lint: true, unit: 'none' }],
		['.github/workflows/deploy.yml', 'workflow', { web: 'full', self: 'deploy' }],
		['.github/actions/setup-monorepo/action.yml', 'github-shared', { unit: 'all', web: 'full' }],
		['scripts/check-ci-test-matrix.mjs', 'scripts', { lint: true, unit: 'none' }],
		['apps/web', 'submodule', { lint: true, unit: 'none' }],
	];
	for (const [file, rule, expected] of cases) {
		assert.equal(classify(file), rule, file);
		const plan = planFor([file], { commentOnly: false });
		for (const [key, value] of Object.entries(expected))
			assert.equal(plan[key], value, `${file}: ${key}`);
	}
});

test('app and package source do not run the device suites on a PR (owner ruling 2026-09-03)', () => {
	// The web suite covers this JS on the PR; the push to main is the everything
	// plan and runs the devices on every merge. Only native-only inputs pay for
	// a device run on the PR.
	for (const file of ['packages/core/src/screens/main/pos/index.tsx', 'apps/main/app/index.tsx']) {
		const plan = planFor([file], { commentOnly: false });
		assert.equal(plan.native, 'none', file);
		assert.equal(plan.web, 'full', file);
		assert.match(plan.reason, /native skipped/);
	}
	for (const file of [
		'apps/main/.maestro/flows/01.yml',
		'apps/main/app.config.ts',
		'pnpm-lock.yaml',
		'.github/workflows/e2e-native.yml',
		'scripts/e2e-native-seed.mjs',
	])
		assert.notEqual(planFor([file], { commentOnly: false }).native, 'none', file);
});

test('native resolver sources retain cache-hit device coverage on a PR', () => {
	for (const file of [
		'apps/main/polyfills.ts',
		'packages/core/src/polyfills.ts',
		'packages/database/src/database-generation.native.ts',
		'packages/core/src/screens/main/pos/products/use-ble-scan.ios.ts',
		'packages/scanner/src/permissions.android.ts',
	]) {
		assert.equal(classify(file), 'native-source', file);
		assert.equal(planFor([file], {}).native, 'cachehit', file);
	}
});

test('native configuration assets require a native rebuild', () => {
	for (const file of [
		'apps/main/assets/images/icon.png',
		'apps/main/assets/images/adaptive-icon.png',
		'apps/main/assets/images/splash-icon.png',
	]) {
		assert.equal(classify(file), 'native-config', file);
		assert.equal(planFor([file], {}).native, 'rebuild', file);
	}
});

test('package dependency manifests require a native rebuild', () => {
	for (const file of ['packages/core/package.json', 'packages/components/package.json']) {
		assert.equal(classify(file), 'package-deps', file);
		assert.equal(planFor([file], {}).native, 'rebuild', file);
	}
});

test('app and package source targeting next retain cache-hit device coverage', () => {
	for (const file of ['packages/core/src/index.ts', 'apps/main/app/index.tsx'])
		assert.equal(planFor([file], { baseBranch: 'next' }).native, 'cachehit', file);

	const plan = planFromDiff(
		({ append, join }) => append(join('packages/core/src/index.ts'), 'export const next = 1;\n'),
		{ GITHUB_BASE_REF: 'next' }
	);
	assert.equal(plan.native, 'cachehit');
});

test('workflow self-triggers widen only their associated tier', () => {
	assert.equal(planFor(['.github/workflows/test.yml'], {}).unit, 'all');
	assert.equal(planFor(['.github/workflows/e2e-native.yml'], {}).native, 'cachehit');
	assert.equal(planFor(['.github/workflows/other.yml'], {}).web, 'none');
});

test('script sub-paths classify conservatively', () => {
	const cases = [
		['scripts/tool.test.mjs', { unit: 'none', web: 'none' }],
		['scripts/e2e-native-seed.mjs', { native: 'cachehit', web: 'none' }],
		['scripts/ci-plan.mjs', { unit: 'all', web: 'full' }],
		['scripts/build-opfs-worker.mjs', { unit: 'all', web: 'full' }],
		['scripts/patch-opfs-worker.mjs', { unit: 'all', web: 'full' }],
		['scripts/patch-rxdb-premium-fix.mjs', { unit: 'all', web: 'full' }],
		['scripts/generate-error-codes.mjs', { unit: 'all', web: 'full' }],
		['scripts/extract-js-strings.js', { unit: 'all', web: 'full' }],
		['scripts/start-dev.mjs', { unit: 'all', web: 'full' }],
	];
	for (const [file, expected] of cases) {
		const plan = planFor([file], {});
		assert.equal(classify(file), 'scripts');
		for (const [key, value] of Object.entries(expected))
			assert.equal(plan[key], value, `${file}: ${key}`);
	}
});

test('a spec plus package source widens web and clears only_specs', () => {
	const plan = planFor(['apps/main/e2e/orders.spec.ts', 'packages/core/src/x.ts'], {});
	assert.equal(plan.web, 'full');
	assert.equal(plan.only_specs, '');
});

test('utils source includes transitive unit dependants including core and main', () => {
	const units = planFor(['packages/utils/src/x.ts'], {}).unit.split(',');
	assert.ok(units.includes('utils'));
	assert.ok(units.includes('core'));
	assert.ok(units.includes('main'));
});

test('native config wins before generic app source', () => {
	assert.equal(classify('apps/main/package.json'), 'native-config');
	assert.equal(planFor(['apps/main/package.json'], {}).native, 'rebuild');
});

test('root dependency resolution inputs permit native rebuilds', () => {
	for (const file of [
		'pnpm-lock.yaml',
		'package.json',
		'pnpm-workspace.yaml',
		'.npmrc',
		'patches/native.patch',
	])
		assert.equal(planFor([file], {}).native, 'rebuild', file);
	assert.equal(planFor(['turbo.json'], {}).native, 'cachehit');
});

test('unknown paths and empty file lists return the everything-plan', () => {
	for (const files of [['unexpected/root.file'], []]) {
		const plan = planFor(files, {});
		assert.deepEqual(
			[plan.lint, plan.unit, plan.web, plan.only_specs, plan.native],
			[true, 'all', 'full', '', 'cachehit']
		);
	}
});

test('a multi-line git error still emits one line per output key', () => {
	// $GITHUB_OUTPUT is `key=value` per line; a newline inside `reason` would
	// corrupt the file and fail the changes job instead of falling back.
	const repo = mkdtempSync(path.join(tmpdir(), 'ci-plan-error-'));
	const result = spawnSync('node', [SCRIPT, 'no-such-ref\nsecond line'], {
		cwd: repo,
		encoding: 'utf8',
		env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request' },
	});
	rmSync(repo, { recursive: true, force: true });
	const lines = result.stdout.split('\n').filter(Boolean);
	assert.equal(lines.length, 7, result.stdout);
	assert.ok(lines.every((line) => /^(lint|unit|web|only_specs|native|self|reason)=/.test(line)));
	const output = outputOf(result);
	assert.equal(output.web, 'full');
	assert.match(output.reason, /git diff against/);
});

test('missing base and non-PR events return the everything-plan', () => {
	for (const [args, event] of [
		[[], 'pull_request'],
		[['HEAD'], 'push'],
	]) {
		const output = outputOf(
			spawnSync('node', [SCRIPT, ...args], {
				encoding: 'utf8',
				env: { ...process.env, GITHUB_EVENT_NAME: event },
			})
		);
		assert.deepEqual(
			[output.lint, output.unit, output.web, output.native],
			['true', 'all', 'full', 'cachehit']
		);
	}
});
