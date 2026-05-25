import { describe, expect, it } from 'vitest';

import { loadWebDevice, saveWebDevice } from '../web-device-store';

function fakeStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
	};
}

describe('web-device-store', () => {
	it('round-trips a device descriptor by profile id', () => {
		const storage = fakeStorage();
		const device = { type: 'usb' as const, language: 'esc-pos' as const, serialNumber: 'abc' };
		saveWebDevice('profile-1', device, storage);
		expect(loadWebDevice('profile-1', storage)).toEqual(device);
	});

	it('returns null when nothing is stored', () => {
		expect(loadWebDevice('missing', fakeStorage())).toBeNull();
	});

	it('returns null for malformed JSON', () => {
		expect(
			loadWebDevice('profile-1', {
				...fakeStorage(),
				getItem: () => '{bad json',
			})
		).toBeNull();
	});

	it('returns null when storage throws while reading', () => {
		expect(
			loadWebDevice('profile-1', {
				...fakeStorage(),
				getItem: () => {
					throw new Error('storage disabled');
				},
			})
		).toBeNull();
	});

	it('does not throw when storage rejects writes', () => {
		const device = { type: 'usb' as const, language: 'esc-pos' as const, serialNumber: 'abc' };
		expect(() =>
			saveWebDevice('profile-1', device, {
				...fakeStorage(),
				setItem: () => {
					throw new Error('quota exceeded');
				},
			})
		).not.toThrow();
	});
});
