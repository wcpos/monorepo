import {
	formatClientSignal,
	parseUpdateRequiredBody,
	protocolHeadersSupported,
} from './sync-protocol';

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
				message: 'This store requires a newer version of WCPOS.',
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

describe('protocolHeadersSupported', () => {
	it('accepts both protocol signal keys in the echo header floor', () => {
		expect(
			protocolHeadersSupported({
				headers: { 'x-wcpos-protocol': {}, 'x-wcpos-client': {} },
			})
		).toBe(true);
	});

	it('accepts explicit reflected-header CORS support', () => {
		expect(protocolHeadersSupported({ cors: { reflects_request_headers: true } })).toBe(true);
	});

	it.each([
		['null echo', null],
		['missing cors evidence', { headers: {} }],
		['non-boolean reflection evidence', { cors: { reflects_request_headers: 'true' } }],
		['only the protocol key', { headers: { 'x-wcpos-protocol': {} } }],
	])('rejects %s', (_name, echo) => {
		expect(protocolHeadersSupported(echo)).toBe(false);
	});
});
