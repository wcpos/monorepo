import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Stage submodule pointer bumps, but only fast-forwards.
 *
 * The pre-commit hook used to run `git submodule update --remote` + a blind
 * `git add`, which staged whatever the submodule checkout happened to be —
 * including checkouts *behind* or *sideways of* the committed gitlink. That
 * silently reverted a deliberate apps/electron pin (see monorepo PR #772).
 *
 * Rules per submodule:
 * - checkout is a descendant of the committed pointer  -> auto-stage
 * - checkout equals the committed pointer              -> nothing to do
 * - checkout is behind / diverged / unknown            -> leave alone; moving
 *   the pointer backwards or sideways requires an explicit `git add <path>`
 * - gitlink already explicitly staged                  -> respect it
 * - submodule not initialized                          -> skip
 */

export const SUBMODULE_PATHS = ['.wiki', 'apps/electron', 'apps/web'];

function git(args, { cwd, allowFailure = false } = {}) {
	try {
		return { ok: true, out: execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
	} catch (error) {
		if (!allowFailure) throw error;
		return { ok: false, out: '', status: error.status };
	}
}

function isFastForward(subDir, from, to) {
	// exit 0 = ancestor, exit 1 = not an ancestor, anything else = commit not
	// present in the submodule clone (treat as "cannot prove it's safe").
	const result = git(['-C', subDir, 'merge-base', '--is-ancestor', from, to], { allowFailure: true });
	if (result.ok) return 'yes';
	return result.status === 1 ? 'no' : 'unknown';
}

export function syncSubmoduleGitlinks({ repoRoot, paths = SUBMODULE_PATHS, log = console.log, warn = console.error } = {}) {
	const results = [];

	for (const path of paths) {
		const subDir = join(repoRoot, path);
		const record = (action, detail = '') => results.push({ path, action, detail });

		if (!existsSync(join(subDir, '.git'))) {
			record('uninitialized');
			continue;
		}

		const committed = git(['rev-parse', '--verify', '--quiet', `HEAD:${path}`], { cwd: repoRoot, allowFailure: true });
		const staged = git(['rev-parse', '--verify', '--quiet', `:${path}`], { cwd: repoRoot, allowFailure: true });
		const checkout = git(['-C', subDir, 'rev-parse', 'HEAD'], { cwd: repoRoot }).out;

		if (staged.ok && committed.ok && staged.out !== committed.out) {
			log(`${path}: gitlink already staged (${staged.out.slice(0, 12)}), leaving it as-is`);
			record('kept-explicit-stage');
			continue;
		}

		if (!committed.ok) {
			warn(`${path}: no committed gitlink for this path; stage it explicitly with \`git add ${path}\` if intended`);
			record('needs-explicit-stage');
			continue;
		}

		if (checkout === committed.out) {
			record('unchanged');
			continue;
		}

		const fastForward = isFastForward(subDir, committed.out, checkout);
		if (fastForward === 'yes') {
			git(['add', path], { cwd: repoRoot });
			log(`${path}: advanced gitlink ${committed.out.slice(0, 12)} -> ${checkout.slice(0, 12)} (fast-forward)`);
			record('staged');
			continue;
		}

		const reason =
			fastForward === 'no'
				? 'is behind or has diverged from the committed pointer'
				: `cannot be compared (committed pointer ${committed.out.slice(0, 12)} is missing from the local submodule clone)`;
		warn(
			`${path}: NOT staging checkout ${checkout.slice(0, 12)} — it ${reason}.\n` +
				`  The commit will keep the current pointer ${committed.out.slice(0, 12)}.\n` +
				`  To move the pointer backwards/sideways on purpose, run: git add ${path}`
		);
		record('blocked', fastForward === 'no' ? 'non-descendant' : 'unknown-ancestry');
	}

	return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const repoRoot = git(['rev-parse', '--show-toplevel']).out;
	syncSubmoduleGitlinks({ repoRoot });
}
