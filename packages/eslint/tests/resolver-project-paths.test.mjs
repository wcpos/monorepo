import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { config } from '../index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..').replaceAll(
	'\\',
	'/'
);

function resolverProjects() {
	const entries = config
		.map((entry) => entry?.settings?.['import/resolver']?.typescript?.project)
		.filter(Boolean);
	assert.equal(entries.length, 1, 'expected exactly one import/resolver typescript block');
	return entries[0];
}

// eslint-import-resolver-typescript globs `project` from process.cwd(), so a
// CWD-relative entry resolves to a different set of tsconfigs per invocation.
// `../../tsconfig.json` meant the repo root under turbo lint (cwd
// packages/<pkg>) but escaped the repo when eslint ran from the repo root —
// and from a git worktree under .claude/worktrees/<name>/ it escaped into the
// MAIN checkout, whose tsconfig extends `expo/tsconfig.base` and cannot be
// resolved without an installed node_modules. That crashed the lint-staged
// pre-commit hook for every worktree commit.
test('resolver tsconfig projects are anchored to this repo, not the CWD', () => {
	for (const project of resolverProjects()) {
		assert.ok(isAbsolute(project), `expected an absolute path, got "${project}"`);
		assert.ok(
			project.startsWith(`${REPO_ROOT}/`),
			`expected "${project}" to stay inside ${REPO_ROOT}`
		);
		assert.ok(
			!project.includes('../'),
			`expected "${project}" to be normalized (no "../" segments)`
		);
	}
});

test('resolver tsconfig projects point at files that exist', () => {
	const projects = resolverProjects();

	const concrete = projects.filter((project) => !project.includes('*'));
	assert.ok(concrete.length > 0, 'expected at least one non-glob entry');
	for (const project of concrete) {
		assert.ok(existsSync(project), `missing tsconfig: ${project}`);
	}

	// A glob is only useful if its fixed prefix resolves — a stale directory name
	// would silently match nothing and drop those tsconfigs from resolution.
	for (const project of projects.filter((entry) => entry.includes('*'))) {
		const prefix = project.slice(0, project.indexOf('*'));
		assert.ok(existsSync(prefix), `missing directory for glob ${project}`);
	}
});
