import type { OffererPeer } from './peer';

declare const require: (name: string) => { RTCPeerConnection: new (config: object) => NativePeer };

interface NativeChannel {
	readyState: string;
	send(text: string): void;
	close(): void;
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: (() => void) | null;
	onerror: (() => void) | null;
}

interface NativePeer {
	iceGatheringState: string;
	connectionState: string;
	localDescription?: { sdp?: string } | null;
	createDataChannel(label: string, options: { ordered: boolean }): NativeChannel;
	createOffer(): Promise<unknown>;
	setLocalDescription(description: unknown): Promise<void>;
	setRemoteDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
	addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
	addEventListener(name: string, listener: () => void): void;
	removeEventListener(name: string, listener: () => void): void;
	close(): void;
}

// Three seconds is the contract cap for embedding host ICE candidates in the SDP.
const ICE_GATHERING_TIMEOUT_MS = 3000;

function waitForIce(connection: NativePeer): Promise<void> {
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
	const { RTCPeerConnection } = require('react-native-webrtc');
	const connection = new RTCPeerConnection({ iceServers: [] });
	const channel = connection.createDataChannel('wcpos-display', { ordered: true });
	let open: () => void = () => undefined;
	let message: (text: string) => void = () => undefined;
	let close: () => void = () => undefined;
	let closed = false;
	const notifyClose = () => {
		if (!closed) {
			closed = true;
			close();
		}
	};
	channel.onopen = () => open();
	channel.onmessage = (event) => message(String(event.data));
	channel.onclose = notifyClose;
	channel.onerror = notifyClose;
	connection.addEventListener('connectionstatechange', () => {
		if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
			notifyClose();
		}
	});
	return {
		async createOffer() {
			await connection.setLocalDescription(await connection.createOffer());
			await waitForIce(connection);
			return { sdp: connection.localDescription?.sdp ?? '' };
		},
		acceptAnswer: (sdp) => connection.setRemoteDescription({ type: 'answer', sdp }),
		addCandidate: (candidate) => connection.addIceCandidate(candidate),
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
			channel.close();
			connection.close();
			notifyClose();
		},
	};
}

export type { OffererPeer } from './peer';
