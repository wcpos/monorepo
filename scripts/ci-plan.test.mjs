import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
function planFromDiff(mutate) {
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
				env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request' },
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
		['packages/utils/src/x.ts', 'package-src', { web: 'full', native: 'cachehit' }],
		['apps/main/src/x.ts', 'app-src', { unit: 'main', web: 'full' }],
		['apps/main/app.config.ts', 'native-config', { native: 'rebuild' }],
		['pnpm-lock.yaml', 'root-deps', { unit: 'all', web: 'full' }],
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

test('unknown paths and empty file lists return the everything-plan', () => {
	for (const files of [['unexpected/root.file'], []]) {
		const plan = planFor(files, {});
		assert.deepEqual(
			[plan.lint, plan.unit, plan.web, plan.only_specs, plan.native],
			[true, 'all', 'full', '', 'cachehit']
		);
	}
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
