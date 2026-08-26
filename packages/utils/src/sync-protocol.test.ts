import { formatClientSignal, parseUpdateRequiredBody } from './sync-protocol';

describe('sync protocol client signal', () => {
	it('formats the platform and version', () => {
		expect(formatClientSignal('electron', '1.11.0')).toBe('electron/1.11.0');
		expect(formatClientSignal('electron', ' 1.11.0 ')).toBe('electron/1.11.0');
	});

	it.each(['', '   ', '\t'])('substitutes unknown for a blank version %p', (version) => {
		expect(formatClientSignal('web', version)).toBe('web/unknown');
	});
});

describe('parseUpdateRequiredBody', () => {
	it('recognizes the refusal envelope and extracts advisory details', () => {
		expect(
			parseUpdateRequiredBody({
				code: 'wcpos_update_required',
				message: 'This store requires a newer version of WooCommerce POS.',
				data: { status: 426, min_protocol: 2, server_protocol: 3, plugin_version: '1.11.0' },
			})
		).toEqual({ minProtocol: 2, serverProtocol: 3, pluginVersion: '1.11.0' });
	});

	it('recognizes the refusal by code alone when data is absent or malformed', () => {
		expect(parseUpdateRequiredBody({ code: 'wcpos_update_required' })).toEqual({});
		expect(parseUpdateRequiredBody({ code: 'wcpos_update_required', data: 'nope' })).toEqual({});
	});

	it('returns null for every other body', () => {
		expect(parseUpdateRequiredBody(null)).toBeNull();
		expect(parseUpdateRequiredBody(undefined)).toBeNull();
		expect(parseUpdateRequiredBody('wcpos_update_required')).toBeNull();
		expect(parseUpdateRequiredBody({ code: 'rest_no_route' })).toBeNull();
		expect(parseUpdateRequiredBody({ data: { min_protocol: 2 } })).toBeNull();
	});
});
