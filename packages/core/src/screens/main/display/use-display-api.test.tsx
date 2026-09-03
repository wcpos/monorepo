/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useDisplayApi } from './use-display-api';

const get = jest.fn();
const post = jest.fn();
const deleteRequest = jest.fn();
const unwrapResponseEnvelope = jest.fn((response) => response);

jest.mock('../hooks/use-rest-http-client', () => ({
	useRestHttpClient: jest.fn(() => ({ get, post, delete: deleteRequest })),
	unwrapResponseEnvelope: (response: unknown) => unwrapResponseEnvelope(response),
}));

describe('useDisplayApi', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		get.mockResolvedValue({ data: [] });
		post.mockResolvedValue({ data: { id: 9 } });
		deleteRequest.mockResolvedValue({ data: null });
	});

	it('calls every Pro display route with its contract body', async () => {
		const { result } = renderHook(() => useDisplayApi());
		const signal = {
			from: 'pos:device-1' as const,
			to: 'display' as const,
			type: 'offer' as const,
			session: 'session-1',
			body: { sdp: 'offer' },
		};

		await result.current.createPairing('device-1');
		await result.current.listDisplays('device-1');
		await result.current.forgetDisplay('d_42');
		await result.current.readSignals('d_42', 7);
		await result.current.postSignal('d_42', signal);

		expect(post).toHaveBeenNthCalledWith(1, 'pairings', { device_id: 'device-1' });
		expect(get).toHaveBeenNthCalledWith(1, 'displays', { params: { device_id: 'device-1' } });
		expect(deleteRequest).toHaveBeenCalledWith('displays/d_42');
		expect(get).toHaveBeenNthCalledWith(2, 'displays/d_42/signal', {
			params: { for: 'pos', since: 7 },
		});
		expect(post).toHaveBeenNthCalledWith(2, 'displays/d_42/signal', signal);
		expect(unwrapResponseEnvelope).toHaveBeenCalledTimes(5);
	});
});
