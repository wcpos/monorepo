// Three seconds is the contract cap for embedding host ICE candidates in the SDP.
const ICE_GATHERING_TIMEOUT_MS = 3000;

export interface OffererPeer {
	createOffer(): Promise<{ sdp: string }>;
	acceptAnswer(sdp: string): Promise<void>;
	addCandidate(candidate: RTCIceCandidateInit): Promise<void>;
	send(text: string): void;
	readonly channelState: 'connecting' | 'open' | 'closed';
	onOpen(fn: () => void): void;
	onMessage(fn: (text: string) => void): void;
	onClose(fn: () => void): void;
	close(): void;
}

function waitForIce(connection: RTCPeerConnection): Promise<void> {
	if (connection.iceGatheringState === 'complete') return Promise.resolve();
	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timeout);
			connection.removeEventListener('icegatheringstatechange', onChange);
			resolve();
		};
		const onChange = () => connection.iceGatheringState === 'complete' && finish();
		const timeout = setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
		connection.addEventListener('icegatheringstatechange', onChange);
	});
}

export function createOfferer(): OffererPeer {
	const connection = new RTCPeerConnection({ iceServers: [] });
	const channel = connection.createDataChannel('wcpos-display', { ordered: true });
	let open: () => void = () => undefined;
	let message: (text: string) => void = () => undefined;
	let close: () => void = () => undefined;
	let closed = false;
	const closePeer = () => {
		if (closed) return;
		closed = true;
		channel.close();
		connection.close();
		close();
	};
	channel.onopen = () => open();
	channel.onmessage = (event) => message(String(event.data));
	channel.onclose = closePeer;
	channel.onerror = closePeer;
	connection.addEventListener('connectionstatechange', () => {
		if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
			closePeer();
		}
	});
	return {
		async createOffer() {
			await connection.setLocalDescription(await connection.createOffer());
			await waitForIce(connection);
			return { sdp: connection.localDescription?.sdp ?? '' };
		},
		async acceptAnswer(sdp) {
			await connection.setRemoteDescription({ type: 'answer', sdp });
		},
		async addCandidate(candidate) {
			await connection.addIceCandidate(candidate);
		},
		send(text) {
			if (channel.readyState !== 'open') throw new Error('Customer display channel is not open');
			channel.send(text);
		},
		get channelState() {
			return channel.readyState === 'open'
				? 'open'
				: channel.readyState === 'connecting'
					? 'connecting'
					: 'closed';
		},
		onOpen(fn) {
			open = fn;
		},
		onMessage(fn) {
			message = fn;
		},
		onClose(fn) {
			close = fn;
		},
		close() {
			closePeer();
		},
	};
}
