import test from 'node:test';
import assert from 'node:assert/strict';

import {
	checkGateCoverage,
	checkWorkspaceTasks,
	isCoveredByFilters,
	parseTurboFilters,
} from './check-workspace-tasks.mjs';

const packageWithoutTypecheck = {
	dir: 'packages/example',
	manifest: {
		name: '@wcpos/example',
		scripts: { lint: 'eslint src' },
	},
};

test('rejects a workspace package with a missing task', () => {
	assert.throws(
		() => checkWorkspaceTasks([packageWithoutTypecheck], []),
		/packages\/example.*typecheck/
	);
});

test('accepts a missing package task when the pair is allowlisted', () => {
	const allowlist = [
		{
			dir: 'packages/example',
			tasks: ['typecheck'],
			reason: 'fixture package intentionally has no TypeScript',
		},
	];

	assert.doesNotThrow(() => checkWorkspaceTasks([packageWithoutTypecheck], allowlist));
});

test('rejects an allowlist entry with a blank reason', () => {
	const allowlist = [
		{
			dir: 'packages/example',
			tasks: ['typecheck'],
			reason: '   ',
		},
	];

	assert.throws(
		() => checkWorkspaceTasks([packageWithoutTypecheck], allowlist),
		/exclusions are allowed, silent exclusions are not/
	);
});

test('rejects an allowlist entry when the package now declares the task', () => {
	const packageWithTypecheck = {
		...packageWithoutTypecheck,
		manifest: {
			...packageWithoutTypecheck.manifest,
			scripts: { lint: 'eslint src', typecheck: 'tsc --noEmit' },
		},
	};
	const allowlist = [
		{
			dir: 'packages/example',
			tasks: ['typecheck'],
			reason: 'fixture package used to lack TypeScript',
		},
	];

	assert.throws(
		() => checkWorkspaceTasks([packageWithTypecheck], allowlist),
		/ALLOWLIST.*stale[^]*typecheck now declared/
	);
});

const rootScripts = {
	lint: "turbo lint --continue --filter='{./packages/*}' --filter='{./apps/main}'",
	typecheck: "turbo typecheck --filter='{./packages/*}' --filter='{./apps/main}'",
};

const studio = {
	dir: 'apps/template-studio',
	manifest: {
		name: '@wcpos/template-studio',
		scripts: { lint: 'eslint src', typecheck: 'tsc --noEmit' },
	},
};

test('parseTurboFilters reads the filter list, stripping ./ and braces', () => {
	assert.deepEqual(parseTurboFilters(rootScripts.lint), ['packages/*', 'apps/main']);
});

test('parseTurboFilters rejects a glob shape it cannot match faithfully', () => {
	assert.throws(
		() => parseTurboFilters("turbo lint --filter='{./apps/**}'"),
		/Unsupported turbo filter/
	);
});

test('isCoveredByFilters matches a literal directory and one trailing /*', () => {
	assert.equal(isCoveredByFilters('packages/core', ['packages/*']), true);
	assert.equal(isCoveredByFilters('apps/main', ['apps/main']), true);
	// `packages/*` is one level deep — it must not swallow a nested directory.
	assert.equal(isCoveredByFilters('packages/core/sub', ['packages/*']), false);
	assert.equal(isCoveredByFilters('apps/template-studio', ['packages/*', 'apps/main']), false);
});

test('rejects a declared task the root gate never selects', () => {
	assert.throws(
		() => checkGateCoverage([studio], rootScripts, []),
		/apps\/template-studio.*lint[^]*outside the root gate|outside the root gate[^]*apps\/template-studio/
	);
});

test('accepts a declared task the root gate selects', () => {
	const covered = {
		...rootScripts,
		lint: `${rootScripts.lint} --filter='{./apps/template-studio}'`,
		typecheck: `${rootScripts.typecheck} --filter='{./apps/template-studio}'`,
	};
	assert.doesNotThrow(() => checkGateCoverage([studio], covered, []));
});

test('accepts an uncovered task when the pair is allowlisted', () => {
	const allowlist = [
		{
			dir: 'apps/template-studio',
			tasks: ['lint', 'typecheck'],
			reason: 'fixture app deliberately outside the gate',
		},
	];
	assert.doesNotThrow(() => checkGateCoverage([studio], rootScripts, allowlist));
});

test('rejects a GATE_ALLOWLIST entry with a blank reason', () => {
	assert.throws(
		() =>
			checkGateCoverage([studio], rootScripts, [
				{ dir: 'apps/template-studio', tasks: ['lint', 'typecheck'], reason: '  ' },
			]),
		/exclusions are allowed, silent exclusions are not/
	);
});

test('rejects a GATE_ALLOWLIST entry once the gate covers the task', () => {
	const covered = {
		...rootScripts,
		lint: `${rootScripts.lint} --filter='{./apps/template-studio}'`,
	};
	assert.throws(
		() =>
			checkGateCoverage([studio], covered, [
				{ dir: 'apps/template-studio', tasks: ['lint'], reason: 'was outside the gate' },
			]),
		/GATE_ALLOWLIST.*stale[^]*lint is now in the gate/
	);
});

test('rejects a root script with no filters rather than reporting full coverage', () => {
	assert.throws(
		() => checkGateCoverage([studio], { ...rootScripts, lint: 'turbo lint' }, []),
		/no --filter.*selectors/
	);
});

test('rejects a missing root script rather than skipping the gate', () => {
	assert.throws(
		() => checkGateCoverage([studio], { typecheck: rootScripts.typecheck }, []),
		/declares no `lint` script/
	);
});
