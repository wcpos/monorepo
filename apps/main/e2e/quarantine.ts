/**
 * #2284: a test listed in `quarantine.json` is marked `fixme` so it stops filling shards to
 * the global timeout (owner's ruling: quarantine, do not shorten timeouts). Each group's fix
 * PR deletes its entries; `scripts/e2e-quarantine-check.mjs` fails on an entry matching no test.
 */
import * as path from 'path';

import quarantineList from './quarantine.json';

import type { TestFixture, TestInfo } from '@playwright/test';

export interface QuarantineEntry {
	project: string;
	file: string;
	/** Describe titles and the test title joined by ` › `, without the file. */
	title: string;
	group: string;
}

type TestIdentity = Pick<TestInfo, 'file' | 'titlePath'> & {
	project: Pick<TestInfo['project'], 'name'>;
};

export function quarantineEntry(
	testInfo: TestIdentity,
	entries: readonly QuarantineEntry[] = quarantineList.entries
): QuarantineEntry | undefined {
	const file = path.basename(testInfo.file);
	// titlePath[0] is the spec file (relative to testDir); the rest is describes + title.
	const title = testInfo.titlePath.slice(1).join(' › ');
	return entries.find(
		(e) => e.project === testInfo.project.name && e.file === file && e.title === title
	);
}

// No dependencies: runs before page/hydration fixtures, not before worker fixtures or beforeAll.
export const quarantineGate: [TestFixture<void, object>, { auto: true }] = [
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	async ({}, use, testInfo) => {
		const entry = quarantineEntry(testInfo);
		if (entry) {
			testInfo.annotations.push({ type: 'quarantine', description: `#2284 ${entry.group}` });
			testInfo.fixme(true, `quarantined: #2284 ${entry.group} (apps/main/e2e/quarantine.json)`);
		}
		await use();
	},
	{ auto: true },
];
