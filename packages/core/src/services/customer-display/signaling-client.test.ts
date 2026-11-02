/** @jest-environment node */

import { createSignalingClient, type HttpFunction } from './signaling-client';

test('uses the display mailbox routes with the expected request shapes', async () => {
	const http = jest.fn(async (request) => {
		if (request.url.endsWith('/displays')) return { data: [{ id: 'display-1' }] };
		if (request.url.endsWith('/signal') && request.method === 'GET')
			return { data: { messages: [] } };
		return { data: { code: '123456', expires_at: 1788433200 } };
	}) as jest.MockedFunction<HttpFunction>;
	const client = createSignalingClient('/wcpos/v2/display/', http);

	await client.mintPairingCode('device-1', 7);
	await client.listDisplays('device-1');
	await client.readSignals('display-1', 12);
	await client.postSignal('display-1', {
		from: 'pos:device-1',
		to: 'display',
		type: 'offer',
		session: 'session-1',
		body: { sdp: 'offer' },
	});
	await client.forget('display-1');

	expect(http.mock.calls.map(([request]) => request)).toEqual([
		{
			method: 'POST',
			url: '/wcpos/v2/display/pairings',
			data: { device_id: 'device-1', store_id: 7 },
		},
		{ method: 'GET', url: '/wcpos/v2/display/displays', params: { device_id: 'device-1' } },
		{
			method: 'GET',
			url: '/wcpos/v2/display/displays/display-1/signal',
			params: { for: 'pos', since: 12 },
		},
		{
			method: 'POST',
			url: '/wcpos/v2/display/displays/display-1/signal',
			data: {
				from: 'pos:device-1',
				to: 'display',
				type: 'offer',
				session: 'session-1',
				body: { sdp: 'offer' },
			},
		},
		{ method: 'DELETE', url: '/wcpos/v2/display/displays/display-1' },
	]);
});
