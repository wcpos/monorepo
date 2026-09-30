// Bare Playwright `test`, so no page opens; the gate lets a throwaway list exercise its modes.
import { test as base, expect } from '@playwright/test';

import { type QuarantineEntry, quarantineEntry, quarantineGate } from './quarantine';

const test = base.extend<{ quarantineGate: void }>({ quarantineGate });

const ENTRY: QuarantineEntry = {
	project: 'pro-authenticated',
	file: 'checkout-device.spec.ts',
	title: 'POS device capture › approve',
	group: 'G2',
};

const testInfo = (project: string, title: string, file = 'checkout-device.spec.ts') => ({
	project: { name: project },
	titlePath: [file, 'POS device capture', title],
});

test('finds the entry for a matching project, file and title', () => {
	expect(quarantineEntry(testInfo('pro-authenticated', 'approve'), [ENTRY])).toBe(ENTRY);
});

test('does not match the same test in a different project', () => {
	expect(quarantineEntry(testInfo('free-authenticated', 'approve'), [ENTRY])).toBeUndefined();
});

test('does not match a different title in the same file', () => {
	expect(quarantineEntry(testInfo('pro-authenticated', 'decline'), [ENTRY])).toBeUndefined();
});

test('matches the path relative to testDir, not the basename', () => {
	const nested = testInfo('pro-authenticated', 'approve', 'nested/checkout-device.spec.ts');
	expect(quarantineEntry(nested, [ENTRY])).toBeUndefined();
});
