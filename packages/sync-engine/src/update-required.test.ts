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
		{ code: 'wcpos_update_required', data: [] },
		{
			code: 'wcpos_update_required',
			data: { min_protocol: NaN, server_protocol: NaN, plugin_version: NaN },
		},
		{
			code: 'wcpos_update_required',
			data: { min_protocol: Infinity, server_protocol: Infinity, plugin_version: Infinity },
		},
		{
			code: 'wcpos_update_required',
			data: { min_protocol: -0, server_protocol: -0, plugin_version: -0 },
		},
		Object.create({ code: 'wcpos_update_required' }),
		{
			code: 'wcpos_update_required',
			data: { min_protocol: 2, server_protocol: 3, plugin_version: '1.11.0', unknown: 'extra' },
			unknown: 'extra',
		},
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
		true,
		() => 'wcpos_update_required',
	])('matches the original for %j', (body) => {
		expect(parseUpdateRequiredBody(body)).toStrictEqual(originalParseUpdateRequiredBody(body));
	});
});
