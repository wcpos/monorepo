import {
	formatClientSignal,
	parseUpdateRequiredBody,
	protocolHeadersSupported,
	sendsProtocolHeaders,
	sendsProtocolQueryTwins,
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
		['a null headers map', { headers: null }],
		['a null headers map beside null cors', { headers: null, cors: null }],
	])('rejects %s without throwing', (_name, echo) => {
		expect(protocolHeadersSupported(echo)).toBe(false);
	});
});

describe('protocol transport send rule', () => {
	it.each([
		['native always sends headers', 'ios', undefined, true],
		['native sends headers with the flag too', 'electron', true, true],
		['web sends headers only with a proven flag', 'web', true, true],
		['web withholds headers without the flag', 'web', undefined, false],
		['web withholds headers on an explicit false', 'web', false, false],
	])('%s', (_name, platform, flag, expected) => {
		expect(sendsProtocolHeaders(platform, flag)).toBe(expected);
	});

	it.each([
		['native always sends the twins', 'android', true, true],
		['web sends the twins while unproven', 'web', undefined, true],
		['web drops the twins once headers are proven', 'web', true, false],
	])('%s', (_name, platform, flag, expected) => {
		expect(sendsProtocolQueryTwins(platform, flag)).toBe(expected);
	});

	it('every platform/flag cell sends the signal on at least one channel', () => {
		for (const platform of ['web', 'ios', 'android', 'electron']) {
			for (const flag of [true, false, undefined]) {
				expect(
					sendsProtocolHeaders(platform, flag) || sendsProtocolQueryTwins(platform, flag)
				).toBe(true);
			}
		}
	});
});
