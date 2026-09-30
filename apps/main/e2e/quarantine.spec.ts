import { expect, test } from './test';
import { quarantineEntry, type QuarantineEntry } from './quarantine';

const ENTRY: QuarantineEntry = {
	project: 'pro-authenticated',
	file: 'checkout-device.spec.ts',
	title: 'POS device capture › approve',
	group: 'G2',
};

const testInfo = (project: string, title: string) => ({
	project: { name: project },
	file: '/repo/apps/main/e2e/checkout-device.spec.ts',
	titlePath: ['checkout-device.spec.ts', 'POS device capture', title],
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
