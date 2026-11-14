/**
 * #2284: a test listed in `quarantine.json` is marked `fixme` so it stops filling shards to
 * the global timeout (owner's ruling: quarantine, do not shorten timeouts). Each group's fix
 * PR deletes its entries; `scripts/e2e-quarantine-check.mjs` fails on an entry matching no test.
 *
 * `E2E_QUARANTINE=only` inverts the gate: only the listed tests run and every other test is
 * skipped, so the weekly run (deploy.yml) can report which entries now pass.
 *
 * An entry with `trunkOnly: true` is quarantined only on the trunk run (a push to `main`, as
 * GitHub reports it); pull-request runs keep running it, and the weekly run still includes it.
 * G8 (Paul, 2026-11-09: "quarantine those four specs on the trunk run until dev-pro has headroom"):
 * load-sensitive gates that fail only when dev-pro is saturated by concurrent E2E runs ("startup
 * sync is still draining", "sync traffic kept flowing after the update-required latch", the
 * server-created record never reaching its grid). Exit: dev-pro headroom (REST median under 1 s
 * with 6 concurrent matrices); remove when the weekly quarantine-only run passes them twice.
 */
import quarantineList from './quarantine.json';

import type { TestFixture, TestInfo } from '@playwright/test';

export interface QuarantineEntry {
	project: string;
	/** The spec's path relative to testDir (titlePath[0]); every spec sits at the top today. */
	file: string;
	/** Describe titles and the test title joined by ` › `, without the file. */
	title: string;
	group: string;
	/** Quarantined only on the trunk run; pull-request runs keep running the test. */
	trunkOnly?: boolean;
}

/** The variables the gate reads; a plain record so a test can pass its own. */
type Env = Readonly<Record<string, string | undefined>>;

/** The trunk run, read from GitHub's own variables: deploy.yml's cold-start job uses the same test. */
export function isTrunkRun(env: Env = process.env): boolean {
	return env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main';
}

/** What the gate does to a test in this run, given its entry (if listed). */
export function quarantineAction(
	entry: QuarantineEntry | undefined,
	env: Env = process.env
): 'run' | 'skip' | 'fixme' {
	if (env.E2E_QUARANTINE === 'only') return entry ? 'run' : 'skip';
	if (!entry || (entry.trunkOnly && !isTrunkRun(env))) return 'run';
	return 'fixme';
}

type TestIdentity = Pick<TestInfo, 'titlePath'> & {
	project: Pick<TestInfo['project'], 'name'>;
};

export function quarantineEntry(
	testInfo: TestIdentity,
	entries: readonly QuarantineEntry[] = quarantineList.entries
): QuarantineEntry | undefined {
	// titlePath[0] is the spec file (relative to testDir); the rest is describes + title.
	const [file, ...titles] = testInfo.titlePath;
	const title = titles.join(' › ');
	return entries.find(
		(e) => e.project === testInfo.project.name && e.file === file && e.title === title
	);
}

// No dependencies: runs before page/hydration fixtures, not before worker fixtures or beforeAll.
export const quarantineGate: [TestFixture<void, object>, { auto: true }] = [
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	async ({}, use, testInfo) => {
		const entry = quarantineEntry(testInfo);
		const action = quarantineAction(entry);
		const issue = entry && `${quarantineList.issue} ${entry.group}`;
		if (issue) testInfo.annotations.push({ type: 'quarantine', description: issue });
		testInfo.skip(
			action === 'skip',
			'E2E_QUARANTINE=only: runs only the tests in e2e/quarantine.json'
		);
		testInfo.fixme(action === 'fixme', `quarantined: ${issue} (apps/main/e2e/quarantine.json)`);
		await use();
	},
	{ auto: true },
];
