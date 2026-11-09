/** @jest-environment node */

import { createOfferer } from './peer';
import { CustomerDisplayService } from './service';

import type { OffererPeer } from './peer';
import type { HttpFunction } from './signaling-client';

const mockLoggerWarn = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
	getLogger: () => ({ warn: (...args: unknown[]) => mockLoggerWarn(...args) }),
}));

const mockPeer: OffererPeer = {
	channelState: 'connecting',
	createOffer: jest.fn(async () => ({ sdp: 'offer' })),
	acceptAnswer: jest.fn(async () => {}),
	addCandidate: jest.fn(async () => {}),
	send: jest.fn(),
	onOpen: jest.fn(),
	onMessage: jest.fn(),
	onClose: jest.fn(),
	close: jest.fn(),
};
jest.mock('./peer', () => ({ createOfferer: jest.fn(() => mockPeer) }));

describe('CustomerDisplayService ICE servers', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
	});
	afterEach(() => jest.useRealTimers());

	test.each([
		{
			name: 'hands the advertised ICE servers to the offerer',
			options: { iceServers: [{ urls: 'stun:a.test:3478' }] },
			expected: [{ urls: 'stun:a.test:3478' }],
		},
		{
			name: 'passes undefined when no ICE servers are advertised, so the offerer uses its default',
			options: {},
			expected: undefined,
		},
	])('$name', async ({ options, expected }) => {
		const http: HttpFunction = async <T>(request: Parameters<HttpFunction>[0]) => {
			if (request.method === 'GET' && request.url.endsWith('/displays')) {
				return {
					data: [
						{
							id: 'display-1',
							name: 'Counter',
							device_id: 'device-1',
							store_id: 7,
							paired_at: 1,
							last_seen: 1,
							connected: true,
						},
					] as T,
				};
			}
			if (request.method === 'GET' && request.url.endsWith('/signal'))
				return { data: { messages: [] } as T };
			return { data: {} as T };
		};
		const service = new CustomerDisplayService({
			http,
			deviceId: 'device-1',
			storeId: 7,
			siteRestRoot: '/wcpos/v2/display',
			...options,
		});
		service.configure({
			store: { id: 7, name: 'Shop', currency: 'EUR', locale: 'en-IE' },
			presentation_hints: {},
			i18n: {},
		});
		service.start();
		await jest.advanceTimersByTimeAsync(1000);
		expect(createOfferer).toHaveBeenCalledTimes(1);
		expect(createOfferer).toHaveBeenCalledWith(expected);
		expect(mockPeer.createOffer).toHaveBeenCalledTimes(1);
		service.stop();
	});
});
