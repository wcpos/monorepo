import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { type DisplayEnvelope, makeEnvelope, uuid } from './envelope';
import { createOfferer, type OffererPeer } from './peer';
import { serialiseSnapshot } from './snapshot';

import type { DisplayRegistryRow, SignalingClient } from './signaling-client';

const logger = getLogger(['wcpos', 'customer-display', 'session']);
// This matches the page default and leaves long enough to read its thank-you state.
export const IDLE_AFTER_COMPLETE_MS = 8000;
const HELLO_TIMEOUT_MS = 10_000; // Match the display page's config timeout before re-offering.
// Mailbox offers expire server-side after two minutes, so only then is a waiting offer stale.
const OFFER_LIFETIME_MS = 2 * 60 * 1000;
// Contract v1 allows at most one snapshot POST per second per display.
const SNAPSHOT_THROTTLE_MS = 1000;
// The server serves a snapshot for 60 s, so re-send while the channel stays shut.
const SNAPSHOT_KEEPALIVE_MS = 20_000;
// Channel heartbeat: the POS pings first, every 5 s, once the config is sent. A display that has
// pinged back is dead after 15 s of silence; one that never pings is an older build and never times out.
const PING_TEXT = '{"type":"ping"}';
const PING_INTERVAL_MS = 5000;
const PEER_SILENCE_MS = 15_000;
export interface DisplayEvent {
	action: string;
	payload: Record<string, unknown>;
}
export interface DisplayConfigInput {
	store: {
		id: number;
		name: string;
		currency: string;
		locale: string;
		timezone?: string;
		logo?: string;
	};
	presentation_hints: Record<string, unknown>;
	i18n: Record<string, string>;
}
interface DisplaySessionOptions {
	display: DisplayRegistryRow;
	deviceId: string;
	signaling: SignalingClient;
	createPeer?: () => OffererPeer;
	getConfig: () => DisplayConfigInput | null;
	getCurrentState: () => DisplayEvent | null;
	onConnectionChange: () => void;
	uuid?: () => string;
	now?: () => Date;
	snapshotFallback?: boolean;
}
export class DisplaySession {
	private display: DisplayRegistryRow;
	private readonly deviceId: string;
	private readonly signaling: SignalingClient;
	private readonly createPeer: () => OffererPeer;
	private readonly getConfig: () => DisplayConfigInput | null;
	private readonly getCurrentState: () => DisplayEvent | null;
	private readonly onConnectionChange: () => void;
	private readonly uuid: () => string;
	private readonly now: () => Date;
	private readonly snapshotFallback: boolean;
	private peer: OffererPeer | null = null;
	private sessionId: string | null = null;
	private offeredAt = 0;
	private cursor = 0;
	private template: { id: string | number; version: number } | null = null;
	private pendingHelloId: string | null = null;
	private pendingCandidates: RTCIceCandidateInit[] = [];
	private answerAccepted = false;
	private configured = false;
	private helloTimer: ReturnType<typeof setTimeout> | null = null;
	private seq = 0;
	private stopped = false;
	private snapshotSeq = 0;
	private snapshotKey: string | null = null;
	private snapshotBody: {
		v: 1;
		seq: number;
		config: Record<string, unknown>;
		event: DisplayEnvelope;
	} | null = null;
	private snapshotSession: string | null = null;
	private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
	private snapshotInFlight = false;
	private snapshotDirty = false;
	private lastSnapshotAt = 0;
	private rejectedSnapshotSeq = 0;
	// Newest id predating the current offer (null before one); a `ready` above it is a reboot.
	private readyFloor: number | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private silenceTimer: ReturnType<typeof setTimeout> | null = null;
	private peerPings = false;

	constructor(options: DisplaySessionOptions) {
		this.display = options.display;
		this.deviceId = options.deviceId;
		this.signaling = options.signaling;
		this.createPeer = options.createPeer ?? createOfferer;
		this.getConfig = options.getConfig;
		this.getCurrentState = options.getCurrentState;
		this.onConnectionChange = options.onConnectionChange;
		this.uuid = options.uuid ?? uuid;
		this.now = options.now ?? (() => new Date());
		this.snapshotFallback = options.snapshotFallback ?? false;
	}
	get isOpen(): boolean {
		return this.peer?.channelState === 'open';
	}
	get isConfigured(): boolean {
		return this.isOpen && this.configured;
	}
	updateDisplay(display: DisplayRegistryRow): void {
		this.display = display;
		this.queueSnapshot();
	}
	async poll(): Promise<void> {
		if (this.stopped) return;
		if (
			this.peer &&
			this.peer.channelState !== 'open' &&
			this.now().getTime() - this.offeredAt >= OFFER_LIFETIME_MS
		) {
			this.peer.close();
		}
		if (!this.peer) await this.postOffer();
		const activeSession = this.sessionId;
		const messages = await this.signaling.readSignals(this.display.id, this.cursor);
		let rebooted: number | null = null;
		for (const message of messages) {
			this.cursor = Math.max(this.cursor, message.id);
			if (message.type === 'ready') {
				// Readies at or below the floor are still in the mailbox from before this offer.
				if (this.readyFloor !== null && message.id > this.readyFloor) rebooted = message.id;
				continue;
			}
			if (message.session !== activeSession) continue;
			if (message.type === 'answer') {
				const sdp = (message.body as { sdp?: unknown }).sdp;
				if (typeof sdp === 'string') {
					await this.applySignal((peer) => peer.acceptAnswer(sdp));
					this.answerAccepted = true;
					for (const candidate of this.pendingCandidates.splice(0)) {
						await this.applySignal((peer) => peer.addCandidate(candidate));
					}
				}
			} else if (message.type === 'candidate') {
				const candidate = message.body as RTCIceCandidateInit;
				if (this.answerAccepted) await this.applySignal((peer) => peer.addCandidate(candidate));
				else this.pendingCandidates.push(candidate);
			} else if (message.type === 'bye') {
				this.peer?.close();
			}
		}
		if (rebooted !== null && !this.stopped) {
			// Without a server offer id the floor is the ready itself, so one ready re-offers once.
			this.readyFloor = rebooted;
			this.peer?.close();
			await this.postOffer();
		}
	}
	private async applySignal(operation: (peer: OffererPeer) => Promise<void>): Promise<void> {
		const peer = this.peer;
		if (!peer) return;
		try {
			await operation(peer);
		} catch (error) {
			peer.close();
			if (this.peer === peer) {
				this.peer = null;
				this.sessionId = null;
				this.pendingCandidates = [];
				this.answerAccepted = false;
			}
			logger.warn('Customer display signaling failed', {
				context: { displayId: this.display.id },
			});
			throw error;
		}
	}
	private async postOffer(): Promise<void> {
		const peer = this.createPeer();
		const sessionId = this.uuid();
		this.stopHeartbeat();
		this.peer = peer;
		this.sessionId = sessionId;
		this.offeredAt = this.now().getTime();
		this.configured = false;
		this.pendingHelloId = null;
		this.pendingCandidates = [];
		this.answerAccepted = false;
		let opened = false;
		peer.onOpen(() => {
			opened = true;
			this.clearSnapshotTimer();
			logger.warn('Customer display channel opened', { context: { displayId: this.display.id } });
			this.helloTimer = setTimeout(() => peer.close(), HELLO_TIMEOUT_MS);
			this.onConnectionChange();
		});
		peer.onMessage((text) => this.handleMessage(text));
		peer.onClose(() => {
			if (this.peer !== peer) return;
			if (this.helloTimer) clearTimeout(this.helloTimer);
			this.helloTimer = null;
			this.stopHeartbeat();
			this.peer = null;
			this.sessionId = null;
			this.configured = false;
			this.pendingHelloId = null;
			this.pendingCandidates = [];
			this.answerAccepted = false;
			if (opened) this.snapshotKey = null;
			this.queueSnapshot();
			logger.warn('Customer display channel closed', { context: { displayId: this.display.id } });
			this.onConnectionChange();
		});
		try {
			const offer = await peer.createOffer();
			const offerId = await this.signaling.postSignal(this.display.id, {
				from: `pos:${this.deviceId}`,
				to: 'display',
				type: 'offer',
				session: sessionId,
				body: offer,
			});
			this.readyFloor = offerId ?? this.readyFloor ?? 0;
			this.snapshotSession = sessionId;
			this.queueSnapshot();
		} catch (error) {
			peer.close();
			if (this.peer === peer) {
				this.peer = null;
				this.sessionId = null;
			}
			logger.warn('Customer display offer failed', {
				context: { displayId: this.display.id },
			});
			throw error;
		}
	}
	private handleMessage(text: string): void {
		// Any message is liveness; the silence deadline runs only once the display has pinged.
		if (this.peerPings) this.armSilence();
		let message: { wcpos?: unknown; id?: unknown; action?: unknown; payload?: unknown };
		try {
			message = JSON.parse(text);
		} catch {
			logger.warn('Dropped malformed customer display message', {
				context: { displayId: this.display.id },
			});
			return;
		}
		if ((message as { type?: unknown } | null)?.type === 'ping') {
			this.peerPings = true;
			this.armSilence();
			return;
		}
		if (
			message.wcpos !== 1 ||
			message.action !== 'display.hello' ||
			typeof message.id !== 'string'
		) {
			logger.warn('Dropped unexpected customer display message', {
				context: { displayId: this.display.id },
			});
			return;
		}
		const template = (message.payload as { template?: unknown } | null)?.template;
		if (!template || typeof template !== 'object') return;
		const { id, version } = template as { id?: unknown; version?: unknown };
		if ((typeof id !== 'string' && typeof id !== 'number') || typeof version !== 'number') return;
		if (this.helloTimer) clearTimeout(this.helloTimer);
		this.helloTimer = null;
		this.template = { id, version };
		this.pendingHelloId = message.id;
		this.sendConfig(message.id);
	}
	private configPayload(config: DisplayConfigInput): Record<string, unknown> {
		return {
			contract: '1.0',
			display: { id: this.display.id, name: this.display.name },
			...config,
			...(this.template ? { template: { ...this.template, settings: {} } } : {}),
			idle: { afterCompleteMs: IDLE_AFTER_COMPLETE_MS },
		};
	}
	private sendConfig(id: string): void {
		const config = this.getConfig();
		if (!config || !this.template || this.peer?.channelState !== 'open') return;
		this.seq = 0;
		const sent = this.send(
			serialiseSnapshot(makeEnvelope('display.config', this.configPayload(config), id))
		);
		if (!sent) return;
		this.configured = true;
		this.startHeartbeat();
		this.onConnectionChange();
		this.pendingHelloId = null;
		const current = this.getCurrentState();
		if (current) this.publish(current);
	}

	refreshConfig(): void {
		if (this.pendingHelloId !== null) this.sendConfig(this.pendingHelloId);
		else if (this.configured) this.sendConfig(this.uuid());
		this.queueSnapshot();
	}

	publish(event: DisplayEvent): boolean {
		if (!this.configured || this.peer?.channelState !== 'open') {
			this.queueSnapshot();
			return false;
		}
		this.seq += 1;
		const sent = this.send(
			serialiseSnapshot(
				makeEnvelope(event.action, {
					...event.payload,
					seq: this.seq,
					sentAt: this.now().toISOString(),
				})
			)
		);
		return sent;
	}

	private snapshotEligible(): boolean {
		return (
			this.snapshotFallback &&
			!this.stopped &&
			!this.isOpen &&
			this.display.connected !== false &&
			this.snapshotSession !== null &&
			this.getConfig() !== null &&
			this.getCurrentState() !== null
		);
	}
	private refreshSnapshotBody(): boolean {
		const config = this.configPayload(this.getConfig()!);
		const state = this.getCurrentState()!;
		const key = JSON.stringify({ config, action: state.action, payload: state.payload });
		if (key === this.snapshotKey) return false;
		this.snapshotSeq += 1;
		this.snapshotKey = key;
		this.snapshotBody = {
			v: 1,
			seq: this.snapshotSeq,
			config,
			event: makeEnvelope(state.action, {
				...state.payload,
				seq: this.snapshotSeq,
				sentAt: this.now().toISOString(),
			}),
		};
		return true;
	}
	private queueSnapshot(): void {
		if (!this.snapshotEligible()) {
			this.clearSnapshotTimer();
			return;
		}
		const changed = this.refreshSnapshotBody();
		if (this.snapshotInFlight) {
			if (changed) this.snapshotDirty = true;
			return;
		}
		if (!changed && this.snapshotTimer) return;
		this.armSnapshot(
			Math.max(0, this.lastSnapshotAt + SNAPSHOT_THROTTLE_MS - this.now().getTime())
		);
	}
	private armSnapshot(delay: number): void {
		this.clearSnapshotTimer();
		this.snapshotTimer = setTimeout(() => void this.sendSnapshot(), delay);
	}
	private clearSnapshotTimer(): void {
		if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
		this.snapshotTimer = null;
	}
	private async sendSnapshot(): Promise<void> {
		this.snapshotTimer = null;
		if (!this.snapshotEligible() || !this.snapshotBody) return;
		this.refreshSnapshotBody();
		const body = this.snapshotBody;
		if (body.seq === this.rejectedSnapshotSeq) return;
		this.snapshotInFlight = true;
		this.snapshotDirty = false;
		this.lastSnapshotAt = this.now().getTime();
		try {
			await this.signaling.postSignal(this.display.id, {
				from: `pos:${this.deviceId}`,
				to: 'display',
				type: 'snapshot',
				session: this.snapshotSession!,
				body,
			});
		} catch (error) {
			const status = (error as { response?: { status?: unknown } })?.response?.status;
			if (status === 400 || status === 413) this.rejectedSnapshotSeq = body.seq;
			logger.warn('Customer display snapshot failed', {
				context: { displayId: this.display.id, status },
			});
		} finally {
			this.snapshotInFlight = false;
		}
		if (this.snapshotEligible()) {
			if (this.snapshotDirty) {
				this.armSnapshot(
					Math.max(0, this.lastSnapshotAt + SNAPSHOT_THROTTLE_MS - this.now().getTime())
				);
			} else this.armSnapshot(SNAPSHOT_KEEPALIVE_MS);
		}
	}
	private send(text: string): boolean {
		try {
			this.peer?.send(text);
			return true;
		} catch (error) {
			logger.warn('Customer display send failed', {
				context: { displayId: this.display.id, error: getErrorMessage(error) },
			});
			this.peer?.close();
			return false;
		}
	}

	private startHeartbeat(): void {
		const peer = this.peer;
		if (this.pingTimer || !peer) return;
		this.pingTimer = setInterval(() => {
			if (this.peer !== peer || peer.channelState !== 'open') this.stopHeartbeat();
			else this.send(PING_TEXT);
		}, PING_INTERVAL_MS);
	}
	private armSilence(): void {
		const peer = this.peer;
		if (this.silenceTimer) clearTimeout(this.silenceTimer);
		// Closing runs the channel-close path: session reset, then the service's fast poll re-offers.
		this.silenceTimer = setTimeout(() => peer?.close(), PEER_SILENCE_MS);
	}
	private stopHeartbeat(): void {
		if (this.pingTimer) clearInterval(this.pingTimer);
		if (this.silenceTimer) clearTimeout(this.silenceTimer);
		this.pingTimer = null;
		this.silenceTimer = null;
		this.peerPings = false;
	}
	private async postBye(session: string): Promise<void> {
		try {
			await this.signaling.postSignal(this.display.id, {
				from: `pos:${this.deviceId}`,
				to: 'display',
				type: 'bye',
				session,
				body: {},
			});
		} catch (error) {
			logger.debug('Customer display bye failed', {
				context: { displayId: this.display.id, error: getErrorMessage(error) },
			});
		}
	}

	async forget(): Promise<void> {
		try {
			if (this.sessionId) {
				await this.signaling.postSignal(this.display.id, {
					from: `pos:${this.deviceId}`,
					to: 'display',
					type: 'bye',
					session: this.sessionId,
					body: {},
				});
			}
		} finally {
			this.stopped = true;
			this.stopHeartbeat();
			this.peer?.close();
			this.clearSnapshotTimer();
		}
	}

	close(): void {
		// Best effort: the display sees a clean stop at once instead of waiting out a timeout.
		if (this.sessionId && !this.stopped) void this.postBye(this.sessionId);
		this.stopped = true;
		this.stopHeartbeat();
		this.clearSnapshotTimer();
		this.peer?.close();
	}
}
