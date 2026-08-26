import { formatClientSignal } from './sync-protocol';

describe('sync protocol client signal', () => {
	it('formats the platform and version', () => {
		expect(formatClientSignal('electron', '1.11.0')).toBe('electron/1.11.0');
		expect(formatClientSignal('electron', ' 1.11.0 ')).toBe('electron/1.11.0');
	});

	it.each(['', '   ', '\t'])('substitutes unknown for a blank version %p', (version) => {
		expect(formatClientSignal('web', version)).toBe('web/unknown');
	});
});
