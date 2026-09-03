import { getLogger } from '@wcpos/utils/logger';

import { makeEnvelope, uuid } from './envelope';
import { createOfferer, type OffererPeer } from './peer';
import { serialiseSnapshot } from './snapshot';

import type { DisplayRegistryRow, SignalingClient } from './signaling-client';

const logger = getLogger(['wcpos', 'customer-display', 'session']);
// This matches the page default and leaves long enough to read its thank-you state.
export const IDLE_AFTER_COMPLETE_MS = 8000;
// Mailbox offers expire server-side after two minutes, so only then is a waiting offer stale.
const OFFER_LIFETIME_MS = 2 * 60 * 1000;
export interface DisplayEvent {
	action: string;
	payload: Record<string, unknown>;
}
export interface DisplayConfigInput {
	store: { id: number; name: string; currency: string; locale: string; timezone?: string };
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
	private peer: OffererPeer | null = null;
	private sessionId: string | null = null;
	private offeredAt = 0;
	private cursor = 0;
	private template: { id: string | number; version: number } | null = null;
	private pendingHelloId: string | null = null;
	private pendingCandidates: RTCIceCandidateInit[] = [];
	private answerAccepted = false;
	private configured = false;
	private seq = 0;
	private stopped = false;

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
	}
	get isOpen(): boolean {
		return this.peer?.channelState === 'open';
	}
	updateDisplay(display: DisplayRegistryRow): void {
		this.display = display;
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
		for (const message of messages) {
			this.cursor = Math.max(this.cursor, message.id);
			if (message.session !== activeSession) continue;
			if (message.type === 'answer') {
				const sdp = (message.body as { sdp?: unknown }).sdp;
				if (typeof sdp === 'string') {
					await this.peer?.acceptAnswer(sdp);
					this.answerAccepted = true;
					for (const candidate of this.pendingCandidates.splice(0)) {
						await this.peer?.addCandidate(candidate);
					}
				}
			} else if (message.type === 'candidate') {
				const candidate = message.body as RTCIceCandidateInit;
				if (this.answerAccepted) await this.peer?.addCandidate(candidate);
				else this.pendingCandidates.push(candidate);
			} else if (message.type === 'bye') {
				this.peer?.close();
			}
		}
	}
	private async postOffer(): Promise<void> {
		const peer = this.createPeer();
		const sessionId = this.uuid();
		this.peer = peer;
		this.sessionId = sessionId;
		this.offeredAt = this.now().getTime();
		this.configured = false;
		this.pendingHelloId = null;
		this.pendingCandidates = [];
		this.answerAccepted = false;
		peer.onOpen(() => {
			logger.warn('Customer display channel opened', { context: { displayId: this.display.id } });
			this.onConnectionChange();
		});
		peer.onMessage((text) => this.handleMessage(text));
		peer.onClose(() => {
			if (this.peer !== peer) return;
			this.peer = null;
			this.sessionId = null;
			this.configured = false;
			this.pendingHelloId = null;
			this.pendingCandidates = [];
			this.answerAccepted = false;
			logger.warn('Customer display channel closed', { context: { displayId: this.display.id } });
			this.onConnectionChange();
		});
		try {
			const offer = await peer.createOffer();
			await this.signaling.postSignal(this.display.id, {
				from: `pos:${this.deviceId}`,
				to: 'display',
				type: 'offer',
				session: sessionId,
				body: offer,
			});
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
		let message: { wcpos?: unknown; id?: unknown; action?: unknown; payload?: unknown };
		try {
			message = JSON.parse(text);
		} catch {
			logger.warn('Dropped malformed customer display message', {
				context: { displayId: this.display.id },
			});
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
		this.template = { id, version };
		this.pendingHelloId = message.id;
		this.sendConfig(message.id);
	}
	private sendConfig(id: string): void {
		const config = this.getConfig();
		if (!config || !this.template || this.peer?.channelState !== 'open') return;
		this.seq = 0;
		const sent = this.send(
			serialiseSnapshot(
				makeEnvelope(
					'display.config',
					{
						contract: '1.0',
						display: { id: this.display.id, name: this.display.name },
						...config,
						template: { ...this.template, settings: {} },
						idle: { afterCompleteMs: IDLE_AFTER_COMPLETE_MS },
					},
					id
				)
			)
		);
		if (!sent) return;
		this.configured = true;
		this.pendingHelloId = null;
		const current = this.getCurrentState();
		if (current) this.publish(current);
	}

	refreshConfig(): void {
		if (this.pendingHelloId !== null) this.sendConfig(this.pendingHelloId);
		else if (this.configured) this.sendConfig(this.uuid());
	}

	publish(event: DisplayEvent): boolean {
		if (!this.configured || this.peer?.channelState !== 'open') return false;
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

	private send(text: string): boolean {
		try {
			this.peer?.send(text);
			return true;
		} catch (error) {
			logger.warn('Customer display send failed', {
				context: { displayId: this.display.id, error },
			});
			this.peer?.close();
			return false;
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
			this.stopped = true;
		} finally {
			this.peer?.close();
		}
	}

	close(): void {
		this.stopped = true;
		this.peer?.close();
	}
}
