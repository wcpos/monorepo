/** @jest-environment node */

import { DEFAULT_ICE_SERVERS } from './ice-servers';
import { createOfferer } from './peer';

test('creates the connection with the default STUN servers', () => {
	const connection = {
		createDataChannel: jest.fn(() => ({})),
		addEventListener: jest.fn(),
	};
	Object.assign(globalThis, { RTCPeerConnection: jest.fn(() => connection) });

	createOfferer();

	expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith({ iceServers: DEFAULT_ICE_SERVERS });
});

test('passes a caller-supplied ICE server list through unchanged', () => {
	const connection = {
		createDataChannel: jest.fn(() => ({})),
		addEventListener: jest.fn(),
	};
	Object.assign(globalThis, { RTCPeerConnection: jest.fn(() => connection) });

	createOfferer([{ urls: 'stun:example.test:3478' }]);

	expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith({
		iceServers: [{ urls: 'stun:example.test:3478' }],
	});
});

test('default ICE servers are STUN only', () => {
	for (const url of DEFAULT_ICE_SERVERS.flatMap((server) => server.urls)) {
		expect(url.startsWith('stun:')).toBe(true);
	}
	for (const server of DEFAULT_ICE_SERVERS) {
		expect(server).not.toHaveProperty('username');
		expect(server).not.toHaveProperty('credential');
	}
});

test('creates the reliable ordered channel and returns gathered local SDP', async () => {
	const channel = {
		readyState: 'connecting',
		send: jest.fn(),
		close: jest.fn(),
		addEventListener: jest.fn(),
	};
	const connection = {
		iceGatheringState: 'complete',
		connectionState: 'new',
		localDescription: { sdp: 'offer-with-candidates' },
		createDataChannel: jest.fn(() => channel),
		createOffer: jest.fn(async () => ({ type: 'offer', sdp: 'initial' })),
		setLocalDescription: jest.fn(async () => undefined),
		setRemoteDescription: jest.fn(async () => undefined),
		addIceCandidate: jest.fn(async () => undefined),
		addEventListener: jest.fn(),
		close: jest.fn(),
	};
	Object.assign(globalThis, { RTCPeerConnection: jest.fn(() => connection) });

	const peer = createOfferer();
	await expect(peer.createOffer()).resolves.toEqual({ sdp: 'offer-with-candidates' });
	expect(connection.createDataChannel).toHaveBeenCalledWith('wcpos-display', { ordered: true });
	await peer.acceptAnswer('answer');
	expect(connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer' });
});

test('caps ICE gathering at three seconds', async () => {
	jest.useFakeTimers();
	const channel = {
		readyState: 'connecting',
		close: jest.fn(),
		send: jest.fn(),
	};
	const connection = {
		iceGatheringState: 'gathering',
		connectionState: 'new',
		localDescription: { sdp: 'timed-offer' },
		createDataChannel: () => channel,
		createOffer: async () => ({ type: 'offer', sdp: 'initial' }),
		setLocalDescription: async () => undefined,
		setRemoteDescription: async () => undefined,
		addIceCandidate: async () => undefined,
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		close: jest.fn(),
	};
	Object.assign(globalThis, { RTCPeerConnection: jest.fn(() => connection) });
	const result = createOfferer().createOffer();
	await jest.advanceTimersByTimeAsync(3000);

	await expect(result).resolves.toEqual({ sdp: 'timed-offer' });
	expect(connection.removeEventListener).toHaveBeenCalledWith(
		'icegatheringstatechange',
		expect.any(Function)
	);
	jest.useRealTimers();
});

test.each(['channel error', 'failed connection'])(
	'%s closes both transports before notifying',
	(cause) => {
		const events: string[] = [];
		const channel = {
			readyState: 'connecting',
			close: jest.fn(() => events.push('channel closed')),
			send: jest.fn(),
			onerror: null as (() => void) | null,
		};
		let connectionStateChange: () => void = () => undefined;
		const connection = {
			iceGatheringState: 'complete',
			connectionState: 'new',
			createDataChannel: () => channel,
			addEventListener: jest.fn((type: string, listener: () => void) => {
				if (type === 'connectionstatechange') connectionStateChange = listener;
			}),
			close: jest.fn(() => events.push('connection closed')),
		};
		Object.assign(globalThis, { RTCPeerConnection: jest.fn(() => connection) });
		const peer = createOfferer();
		peer.onClose(() => events.push('notified'));

		if (cause === 'channel error') channel.onerror?.();
		else {
			connection.connectionState = 'failed';
			connectionStateChange();
		}

		expect(events).toEqual(['channel closed', 'connection closed', 'notified']);
	}
);
