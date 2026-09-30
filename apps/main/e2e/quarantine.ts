/**
 * #2284: a test listed in `quarantine.json` is marked `fixme` so it stops filling shards to
 * the global timeout (owner's ruling: quarantine, do not shorten timeouts). Each group's fix
 * PR deletes its entries; `scripts/e2e-quarantine-check.mjs` fails on an entry matching no test.
 *
 * `E2E_QUARANTINE=only` inverts the gate: only the listed tests run and every other test is
 * skipped, so the weekly run (deploy.yml) can report which entries now pass.
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
		const issue = entry && `${quarantineList.issue} ${entry.group}`;
		if (issue) testInfo.annotations.push({ type: 'quarantine', description: issue });
		if (process.env.E2E_QUARANTINE === 'only') {
			testInfo.skip(!entry, 'E2E_QUARANTINE=only: runs only the tests in e2e/quarantine.json');
		} else if (issue) {
			testInfo.fixme(true, `quarantined: ${issue} (apps/main/e2e/quarantine.json)`);
		}
		await use();
	},
	{ auto: true },
];
