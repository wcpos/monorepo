/** @jest-environment jsdom */
import { getInstanceId } from './get-instance-id.web';

describe('getInstanceId (web)', () => {
	beforeEach(() => window.localStorage.clear());

	it('mints once and returns the same id afterwards, under its own key', () => {
		const first = getInstanceId();
		expect(first).toMatch(/^[0-9a-f-]{36}$/);
		expect(getInstanceId()).toBe(first);
		expect(window.localStorage.getItem('wcpos_instance_id')).toBe(first);
		// Not the telemetry id: consent denial removes that one, never this.
		expect(window.localStorage.getItem('wcpos_install_id')).toBeNull();
	});

	it('returns undefined when storage throws', () => {
		const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		expect(getInstanceId()).toBeUndefined();
		spy.mockRestore();
	});
});
