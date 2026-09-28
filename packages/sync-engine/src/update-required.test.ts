import { describe, expect, it } from 'vitest';

import {
	UPDATE_REQUIRED_SERVER_CODE as ORIGINAL_UPDATE_REQUIRED_SERVER_CODE,
	parseUpdateRequiredBody as originalParseUpdateRequiredBody,
} from '@wcpos/utils/sync-protocol';

import { parseUpdateRequiredBody, UPDATE_REQUIRED_SERVER_CODE } from './update-required';

describe('update-required parity', () => {
	it('uses the same server code', () => {
		expect(UPDATE_REQUIRED_SERVER_CODE).toBe(ORIGINAL_UPDATE_REQUIRED_SERVER_CODE);
	});

	it.each([
		{
			code: 'wcpos_update_required',
			data: { min_protocol: 2, server_protocol: 3, plugin_version: '1.11.0' },
		},
		{ code: 'wcpos_update_required' },
		{ code: 'wcpos_update_required', data: 'invalid' },
		{ code: 'wcpos_update_required', data: null },
		{
			code: 'wcpos_update_required',
			data: { min_protocol: '2', server_protocol: false, plugin_version: 111 },
		},
		{ code: 'different_code' },
		null,
		undefined,
		'wcpos_update_required',
		426,
		[],
	])('matches the original for %j', (body) => {
		expect(parseUpdateRequiredBody(body)).toEqual(originalParseUpdateRequiredBody(body));
	});
});
