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

	test('falls back to the default ICE servers when the offerer refuses the advertised list', async () => {
		const iceServers = [{ urls: 'stun:a.test:3478' }];
		const mockCreateOfferer = jest.mocked(createOfferer);
		mockCreateOfferer.mockImplementationOnce((servers) => {
			if (servers !== undefined) throw new Error('ICE servers refused');
			return mockPeer;
		});
		const requests: Parameters<HttpFunction>[0][] = [];
		const http: HttpFunction = async <T>(request: Parameters<HttpFunction>[0]) => {
			requests.push(request);
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
			iceServers,
		});
		service.configure({
			store: { id: 7, name: 'Shop', currency: 'EUR', locale: 'en-IE' },
			presentation_hints: {},
			i18n: {},
		});
		service.start();
		await jest.advanceTimersByTimeAsync(1000);
		expect(mockCreateOfferer).toHaveBeenCalledTimes(2);
		expect(mockCreateOfferer).toHaveBeenNthCalledWith(1, iceServers);
		expect(mockCreateOfferer).toHaveBeenNthCalledWith(2);
		expect(mockPeer.createOffer).toHaveBeenCalledTimes(1);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'Customer display ICE servers refused; using the default STUN servers',
			expect.anything()
		);
		expect(requests).toContainEqual({
			method: 'POST',
			url: '/wcpos/v2/display/displays/display-1/signal',
			data: expect.objectContaining({ type: 'offer' }),
		});
		service.stop();
	});

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
