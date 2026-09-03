/** @jest-environment node */

import { createOfferer } from './peer';

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
