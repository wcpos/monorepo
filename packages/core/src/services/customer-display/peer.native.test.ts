/** @jest-environment node */

test('lazy-loads react-native-webrtc and creates the same ordered reliable offerer', async () => {
	jest.resetModules();
	const channel = {
		readyState: 'connecting',
		send: jest.fn(),
		close: jest.fn(),
		onopen: null,
		onmessage: null,
		onclose: null,
		onerror: null,
	};
	const connection = {
		iceGatheringState: 'complete',
		connectionState: 'new',
		localDescription: { sdp: 'native-offer' },
		createDataChannel: jest.fn(() => channel),
		createOffer: jest.fn(async () => ({ type: 'offer', sdp: 'initial' })),
		setLocalDescription: jest.fn(async () => undefined),
		setRemoteDescription: jest.fn(async () => undefined),
		addIceCandidate: jest.fn(async () => undefined),
		addEventListener: jest.fn(),
		removeEventListener: jest.fn(),
		close: jest.fn(),
	};
	const constructor = jest.fn(() => connection);
	jest.doMock('react-native-webrtc', () => ({ RTCPeerConnection: constructor }), { virtual: true });
	const { createOfferer } = await import('./peer.native');

	const peer = createOfferer();
	await expect(peer.createOffer()).resolves.toEqual({ sdp: 'native-offer' });
	expect(constructor).toHaveBeenCalledWith({ iceServers: [] });
	expect(connection.createDataChannel).toHaveBeenCalledWith('wcpos-display', { ordered: true });
});
