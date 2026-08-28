import assert from 'node:assert/strict';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { planFor } from './ci-plan.mjs';

import {
	ALLOWLIST,
	checkCiTestMatrix,
	detectLanes,
	findTestFiles,
	OTHER_LANES,
	parseWorkspaceGlobs,
	readLaneSources,
	readSubmodulePaths,
	resolveWorkspacePackages,
	surveyPackages,
} from './check-ci-test-matrix.mjs';

/* --------------------------------------------------------- workspace parsing */

test('reads the package globs out of pnpm-workspace.yaml', () => {
	const yaml = [
		'packages:',
		'  - "apps/*"',
		'  - "packages/*"',
		'  - tools/one',
		'  - "!packages/excluded"',
		'nodeLinker: hoisted',
		'overrides:',
		'  expo: "~57.0.8"',
	].join('\n');
	assert.deepEqual(parseWorkspaceGlobs(yaml), ['apps/*', 'packages/*', 'tools/one']);
});

test('the real workspace file still parses', () => {
	// A silent [] here would make every package look testless and the check pass
	// vacuously — the exact failure mode it exists to prevent.
	assert.ok(surveyPackages().length > 5);
});

/* ---------------------------------------------------------------- fixture fs */

function makeTree() {
	const root = mkdtempSync(path.join(tmpdir(), 'ci-matrix-'));
	const write = (relative, content) => {
		mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
		writeFileSync(path.join(root, relative), content);
	};
	const pkg = (dir, name, scripts = {}) =>
		write(`${dir}/package.json`, JSON.stringify({ name, scripts }));
	return { root, write, pkg };
}

test('resolves globs to directories that actually hold a package.json', (t) => {
	const tree = makeTree();
	t.after(() => rmSync(tree.root, { recursive: true, force: true }));
	tree.pkg('packages/alpha', '@wcpos/alpha');
	tree.pkg('apps/beta', '@wcpos/beta');
	mkdirSync(path.join(tree.root, 'packages/not-a-package'), {
		recursive: true,
	});

	assert.deepEqual(resolveWorkspacePackages(['apps/*', 'packages/*'], tree.root), [
		'apps/beta',
		'packages/alpha',
	]);
});

test('rejects workspace glob shapes the resolver does not support', (t) => {
	const tree = makeTree();
	t.after(() => rmSync(tree.root, { recursive: true, force: true }));

	for (const glob of ['packages/**', 'packages/*/nested', 'packages/{a,b}']) {
		assert.throws(
			() => resolveWorkspacePackages([glob], tree.root),
			/unsupported workspace glob/i,
			glob
		);
	}
});

test('finds test files and skips build output', (t) => {
	const tree = makeTree();
	t.after(() => rmSync(tree.root, { recursive: true, force: true }));
	tree.write('packages/alpha/src/a.test.ts', '');
	tree.write('packages/alpha/src/nested/b.spec.tsx', '');
	tree.write('packages/alpha/src/c.test.mjs', '');
	tree.write('packages/alpha/src/index.ts', '');
	tree.write('packages/alpha/dist/d.test.js', '');
	tree.write('packages/alpha/node_modules/dep/e.test.js', '');
	tree.write('packages/alpha/coverage/f.test.js', '');

	assert.deepEqual(findTestFiles('packages/alpha', tree.root).sort(), [
		'packages/alpha/src/a.test.ts',
		'packages/alpha/src/c.test.mjs',
		'packages/alpha/src/nested/b.spec.tsx',
	]);
});

/* -------------------------------------------------------------- lane parsing */

const PACKAGES = [
	{ dir: 'packages/core', name: '@wcpos/core' },
	{ dir: 'packages/order-math', name: '@wcpos/order-math' },
	{ dir: 'packages/query', name: '@wcpos/query' },
	{ dir: 'packages/printer', name: '@wcpos/printer' },
	{ dir: 'packages/scanner', name: '@wcpos/scanner' },
	{ dir: 'packages/eslint', name: '@wcpos/eslint-config' },
	{ dir: 'packages/dark', name: '@wcpos/dark' },
	{ dir: 'apps/main', name: '@wcpos/main' },
];

test('shape 1: a for-loop list covers every package it names', () => {
	const lanes = detectLanes(
		[
			[
				'test.yml',
				'for pkg in core order-math printer; do\n  cd packages/$pkg\n  npx jest --ci\n  cd ../..\ndone',
			],
		],
		PACKAGES
	);
	assert.ok(lanes.has('packages/core'));
	assert.ok(lanes.has('packages/order-math'));
	assert.ok(lanes.has('packages/printer'));
	assert.ok(!lanes.has('packages/dark'));
});

test('shape 1: a loop token may name the package instead of the directory', () => {
	// packages/eslint publishes @wcpos/eslint-config — directory-only matching
	// would call it dark while CI runs it.
	const lanes = detectLanes(
		[['test.yml', 'for pkg in eslint-config; do\n  pnpm --filter @wcpos/$pkg test\ndone']],
		PACKAGES
	);
	assert.ok(lanes.has('packages/eslint'));
});

test('shape 1: reporting and coverage loops do not count as test lanes', () => {
	const lanes = detectLanes(
		[
			[
				'test.yml',
				[
					'for pkg in core order-math; do',
					'  file="packages/$pkg/test-results.json"',
					'  node -e "console.log(require(\'./$file\'))"',
					'done',
					'for pkg in core order-math; do',
					'  file="packages/$pkg/coverage/coverage-summary.json"',
					'  echo "$file"',
					'done',
				].join('\n'),
			],
		],
		PACKAGES
	);
	assert.ok(!lanes.has('packages/core'));
	assert.ok(!lanes.has('packages/order-math'));
});

test('shape 2: --filter counts only alongside a test verb', () => {
	const covered = detectLanes([['w.yml', 'pnpm --filter @wcpos/main exec jest --ci']], PACKAGES);
	assert.ok(covered.has('apps/main'));

	const building = detectLanes([['w.yml', 'pnpm --filter @wcpos/main build']], PACKAGES);
	assert.ok(!building.has('apps/main'), 'a build is not a test lane');
});

test('shape 2: every --filter on a chained line is seen, not just the first', () => {
	// Regression: a greedy tail capture consumed the rest of the line, so the
	// second package on a `&&` chain silently read as dark.
	const lanes = detectLanes(
		[
			[
				'package.json#test:scripts',
				'node x.mjs && pnpm --filter @wcpos/printer test && pnpm --filter @wcpos/eslint-config test',
			],
		],
		PACKAGES
	);
	assert.ok(lanes.has('packages/printer'));
	assert.ok(lanes.has('packages/eslint'), 'the second --filter on the line must be seen');
});

test('shape 2: a package cannot borrow the test verb from the next command', () => {
	const lanes = detectLanes(
		[['w.yml', 'pnpm --filter @wcpos/dark build && pnpm --filter @wcpos/core test']],
		PACKAGES
	);
	assert.ok(lanes.has('packages/core'));
	assert.ok(!lanes.has('packages/dark'), 'the && must cut the tail');
});

test('shape 3: cd into a package followed by a runner counts', () => {
	const lanes = detectLanes(
		[['test.yml', 'cd packages/query\nnpx jest --config jest.config.cjs --ci\ncd ../..']],
		PACKAGES
	);
	assert.ok(lanes.has('packages/query'));

	const noRunner = detectLanes([['test.yml', 'cd packages/query\nnpx tsc --noEmit']], PACKAGES);
	assert.ok(!noRunner.has('packages/query'));
});

test('shape 3: a package cannot borrow a runner from the next YAML step', () => {
	const lanes = detectLanes(
		[
			[
				'test.yml',
				[
					'- name: Typecheck query',
					'  run: |',
					'    cd packages/query',
					'    npx tsc --noEmit',
					'- if: always()',
					'  name: Test core',
					'  run: pnpm --filter @wcpos/core exec jest --ci',
				].join('\n'),
			],
		],
		PACKAGES
	);

	assert.ok(!lanes.has('packages/query'));
	assert.ok(lanes.has('packages/core'));
});

test('root script names are escaped before workflow matching', (t) => {
	const tree = makeTree();
	t.after(() => rmSync(tree.root, { recursive: true, force: true }));
	tree.write('package.json', JSON.stringify({ scripts: { 'test+scripts': 'echo covered' } }));
	tree.write('.github/workflows/test.yml', 'run: pnpm test+scripts\n');

	assert.deepEqual(
		readLaneSources(tree.root).find(([source]) => source.startsWith('package')),
		['package.json#test+scripts', 'echo covered']
	);
});

test('a commented-out command is not a lane', () => {
	// Deleting the executable line but leaving the comment behind is the cheapest
	// possible way to turn a suite off, and it leaves the words a text scan looks
	// for sitting right there in the file.
	const commentedLoop = detectLanes(
		[['test.yml', '# for pkg in core order-math; do\n#   npx jest --ci\n# done']],
		PACKAGES
	);
	assert.ok(!commentedLoop.has('packages/core'));
	assert.ok(!commentedLoop.has('packages/order-math'));

	const commentedFilter = detectLanes(
		[['test.yml', '  # pnpm --filter @wcpos/printer test']],
		PACKAGES
	);
	assert.ok(!commentedFilter.has('packages/printer'));

	const commentedCd = detectLanes(
		[['test.yml', '# cd packages/query\n# npx jest --config jest.config.cjs']],
		PACKAGES
	);
	assert.ok(!commentedCd.has('packages/query'));

	// A `#` that is not opening a comment must survive — `"## 📊 Coverage"` is a
	// real line in test.yml, and blanking from it would eat the rest of the step.
	const stillCounts = detectLanes(
		[['test.yml', 'echo "## report" && pnpm --filter @wcpos/printer test']],
		PACKAGES
	);
	assert.ok(stillCounts.has('packages/printer'));
});

test('the playwright lane check rejects a commented-out invocation', (t) => {
	const tree = makeTree();
	t.after(() => rmSync(tree.root, { recursive: true, force: true }));
	tree.write('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
	tree.write('package.json', JSON.stringify({ scripts: {} }));
	tree.pkg('packages/core', '@wcpos/core', { test: 'jest' });
	tree.write('packages/core/src/core.test.ts', '');
	tree.write('.github/workflows/test.yml', 'pnpm --filter @wcpos/core exec jest --ci\n');
	tree.write('.github/workflows/deploy.yml', '      # run: cd apps/main && npx playwright test\n');

	assert.throws(() => checkCiTestMatrix(tree.root), /playwright.*NO CI lane/is);
});

test('the playwright lane check rejects non-executable or out-of-step matches', (t) => {
	const workflows = [
		`run: |
  cd apps/main
  echo "npx playwright test $SPECS"
`,
		`run: |
  cd apps/main
  npx
  playwright test
`,
		`- run: cd apps/main
- run: npx playwright test
`,
	];

	for (const workflow of workflows) {
		const tree = makeTree();
		t.after(() => rmSync(tree.root, { recursive: true, force: true }));
		tree.write('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
		tree.write('package.json', JSON.stringify({ scripts: {} }));
		tree.pkg('packages/core', '@wcpos/core', { test: 'jest' });
		tree.write('packages/core/src/core.test.ts', '');
		tree.write('.github/workflows/test.yml', 'pnpm --filter @wcpos/core exec jest --ci\n');
		tree.write('.github/workflows/deploy.yml', workflow);

		assert.throws(() => checkCiTestMatrix(tree.root), /playwright.*NO CI lane/is, workflow);
	}
});

test('a package mentioned nowhere is dark', () => {
	const lanes = detectLanes([['test.yml', 'for pkg in core; do x; done']], PACKAGES);
	assert.ok(!lanes.has('packages/dark'));
});

/* -------------------------------------------------------------- gitmodules */

test('reads submodule paths from .gitmodules', (t) => {
	const tree = makeTree();
	t.after(() => rmSync(tree.root, { recursive: true, force: true }));
	tree.write(
		'.gitmodules',
		'[submodule "apps/electron"]\n\tpath = apps/electron\n\turl = x\n[submodule "apps/web"]\n\tpath = apps/web\n\turl = y\n'
	);
	assert.deepEqual([...readSubmodulePaths(tree.root)].sort(), ['apps/electron', 'apps/web']);
});

test('the repo declares its submodules, so their tests never read as dark', () => {
	// apps/web and apps/electron appear or vanish depending on whether the
	// checkout initialized them; the survey must not depend on that.
	const submodules = readSubmodulePaths();
	assert.ok(submodules.has('apps/web'));
	assert.ok(submodules.has('apps/electron'));
});

/* ------------------------------------------------------------ live invariants */

test('the current tree has no dark packages', () => {
	assert.doesNotThrow(() => checkCiTestMatrix());
});

test('every allowlist entry carries a reason, and a TODO if it is temporary', () => {
	for (const entry of ALLOWLIST) {
		assert.ok(entry.dir, 'an allowlist entry needs a dir');
		assert.ok(entry.reason?.trim(), `${entry.dir} needs a reason`);
		assert.match(
			entry.reason,
			/TODO\(#\d+\)|permanent/,
			`${entry.dir}: cite an issue or say permanent`
		);
	}
});

test('every other-lane entry points at a workflow that exists', () => {
	// An OTHER_LANES entry is a promise that some other workflow runs those
	// specs. If that workflow is renamed or deleted the specs go dark silently,
	// which is the whole failure this check exists to prevent.
	const workflowDir = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		'../.github/workflows'
	);
	const workflows = new Set(readdirSync(workflowDir));
	for (const entry of OTHER_LANES) {
		assert.ok(workflows.has(entry.workflow), `${entry.dir} points at a missing ${entry.workflow}`);
		assert.ok(entry.reason?.trim(), `${entry.dir} needs a reason`);
		assert.ok(existsSync(path.resolve(workflowDir, '../..', entry.dir)), `${entry.dir} is gone`);
	}
});

test('the allowlist fails closed when an entry is gone or has no tests', (t) => {
	const roots = [];
	t.after(() => {
		for (const root of roots) rmSync(root, { recursive: true, force: true });
	});

	for (const packageState of ['gone', 'testless']) {
		const tree = makeTree();
		roots.push(tree.root);
		tree.write('pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n');
		tree.write('package.json', JSON.stringify({ scripts: {} }));
		tree.write('.github/workflows/test.yml', 'name: tests\n');
		tree.write('.github/workflows/deploy.yml', 'run: cd apps/main && npx playwright test\n');
		if (packageState === 'testless') {
			tree.pkg('apps/template-studio', '@wcpos/template-studio');
		}

		assert.throws(
			() => checkCiTestMatrix(tree.root),
			/ALLOWLIST.*(?:gone|no test files)/is,
			packageState
		);
	}
});

test('the CI planner runs Lint for every matrix input', () => {
	// The matrix reads workflows and the workspace file; a change to any of
	// them must reach the Lint job, where this check runs. The planner replaced
	// the old path filter, so the guarantee is asserted against it directly.
	for (const file of [
		'.github/workflows/test.yml',
		'.github/workflows/anything.yaml',
		'pnpm-workspace.yaml',
	]) {
		assert.equal(planFor([file]).lint, true, `${file} must run Lint`);
	}
});

test('package and script tests run before governance entrypoints', () => {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
	const script = manifest.scripts['test:scripts'];
	const firstGovernance = script.indexOf('node scripts/check-dep-duplicates.mjs');

	for (const command of [
		'pnpm --filter @wcpos/virtual-printer test',
		'pnpm --filter @wcpos/eslint-config test',
		'node --test scripts/*.test.mjs',
	]) {
		const commandIndex = script.indexOf(command);
		assert.ok(commandIndex >= 0, `${command} must remain in test:scripts`);
		assert.ok(commandIndex < firstGovernance, `${command} must run before governance checks`);
	}
});

test('the matrix fails when the playwright workflow stops invoking its suite', (t) => {
	// This is not hypothetical: #1027 retired e2e-native.yml on next while
	// apps/main/.maestro was still an OTHER_LANES entry, and this assertion is
	// what turned that into a red build instead of a silent lie.
	const tree = makeTree();
	t.after(() => rmSync(tree.root, { recursive: true, force: true }));
	tree.write('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
	tree.write('package.json', JSON.stringify({ scripts: {} }));
	tree.pkg('packages/core', '@wcpos/core', { test: 'jest' });
	tree.write('packages/core/src/core.test.ts', '');
	tree.write('.github/workflows/test.yml', 'pnpm --filter @wcpos/core exec jest --ci\n');
	tree.write('.github/workflows/deploy.yml', 'name: deploy\n');

	assert.throws(() => checkCiTestMatrix(tree.root), /playwright.*NO CI lane/is);
});

test('a lane whose workflow file is deleted outright fails closed', (t) => {
	// The #1027 shape exactly: the workflow does not merely stop invoking the
	// suite, it stops existing.
	const tree = makeTree();
	t.after(() => rmSync(tree.root, { recursive: true, force: true }));
	tree.write('pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n');
	tree.write('package.json', JSON.stringify({ scripts: {} }));
	tree.pkg('packages/core', '@wcpos/core', { test: 'jest' });
	tree.write('packages/core/src/core.test.ts', '');
	tree.write('.github/workflows/test.yml', 'pnpm --filter @wcpos/core exec jest --ci\n');

	assert.throws(() => checkCiTestMatrix(tree.root), /playwright.*NO CI lane/is);
});
