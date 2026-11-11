// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import {
	__resetSchedulerBootIdForTests,
	isOwnerFromAnotherBoot,
	mintSchedulerOwnerId,
} from './scheduler-owner-id';

const uuid = () => globalThis.crypto.randomUUID();
const bootOf = (ownerId: string) => ownerId.slice(ownerId.indexOf('@boot:'));

afterEach(() => __resetSchedulerBootIdForTests());

describe('scheduler owner ids (#3500)', () => {
	it('mints a unique owner id per call that shares this runtime boot id', () => {
		const first = mintSchedulerOwnerId('require-plane', uuid);
		const second = mintSchedulerOwnerId('engine', uuid);

		expect(first).not.toBe(second);
		expect(first).toMatch(/^require-plane:[^@]+@boot:[^@]+$/);
		expect(bootOf(first)).toBe(bootOf(second));
		expect(isOwnerFromAnotherBoot(first)).toBe(false);
		expect(isOwnerFromAnotherBoot(second)).toBe(false);
	});

	it('reads an id minted before a fresh process as another boot, and the new one as this boot', () => {
		const before = mintSchedulerOwnerId('require-plane', uuid);
		__resetSchedulerBootIdForTests();
		// Before this "process" mints anything, a minted id is from some other runtime.
		expect(isOwnerFromAnotherBoot(before)).toBe(true);
		const after = mintSchedulerOwnerId('require-plane', uuid);

		expect(isOwnerFromAnotherBoot(before)).toBe(true);
		expect(isOwnerFromAnotherBoot(after)).toBe(false);
	});

	it('never reads null, the legacy constant or an unformatted test id as another boot', () => {
		mintSchedulerOwnerId('require-plane', uuid);

		expect(isOwnerFromAnotherBoot(null)).toBe(false);
		expect(isOwnerFromAnotherBoot('require-plane')).toBe(false);
		expect(isOwnerFromAnotherBoot('owner-a')).toBe(false);
	});

	it('still mints distinct same-boot ids where Web Crypto is missing (a plain-http web store)', () => {
		const throwingUuid = () => {
			throw new Error('webCryptoUuid: crypto.randomUUID is unavailable here');
		};
		const first = mintSchedulerOwnerId('require-plane', throwingUuid);
		const second = mintSchedulerOwnerId('require-plane', throwingUuid);

		expect(first).not.toBe(second);
		expect(first).toMatch(/^require-plane:[^@]+@boot:[^@]+$/);
		expect(second).toMatch(/^require-plane:[^@]+@boot:[^@]+$/);
		expect(bootOf(first)).toBe(bootOf(second));
		expect(isOwnerFromAnotherBoot(first)).toBe(false);
		expect(isOwnerFromAnotherBoot(second)).toBe(false);
	});

	it('refuses a role that would push the owner id past 128 characters', () => {
		expect(() => mintSchedulerOwnerId('r'.repeat(60), uuid)).toThrow(/exceeds 128/);
	});
});
