import { getLogger } from '@wcpos/utils/logger';

import {
	type DisplayConfigInput,
	type DisplayEvent,
	DisplaySession,
	IDLE_AFTER_COMPLETE_MS,
} from './display-session';
import { createOfferer, type OffererPeer } from './peer';
import {
	createSignalingClient,
	type DisplayRegistryRow,
	type HttpFunction,
	type PairingCode,
} from './signaling-client';

const logger = getLogger(['wcpos', 'customer-display', 'service']);
// Five seconds is the POS-side signaling and pairing-registry cadence in contract v1.
const REGISTRY_POLL_MS = 5000;
export interface CustomerDisplayServiceOptions {
	http: HttpFunction;
	deviceId: string;
	storeId: number;
	siteRestRoot: string;
	createPeer?: () => OffererPeer;
	now?: () => Date;
}
export interface CustomerDisplayState {
	displays: DisplayRegistryRow[];
	pairingCode: PairingCode | null;
}
export class CustomerDisplayService {
	private readonly signaling;
	private readonly options: CustomerDisplayServiceOptions;
	private readonly sessions = new Map<string, DisplaySession>();
	private readonly listeners = new Set<() => void>();
	private displays: DisplayRegistryRow[] = [];
	private pairingCode: PairingCode | null = null;
	private pairingDisplayIds = new Set<string>();
	private config: DisplayConfigInput | null = null;
	private currentState: DisplayEvent | null = null;
	private lastPublished: string | null = null;
	private suppressIdleUntil = 0;
	private pendingIdle: DisplayEvent | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private registryReadSucceeded = false;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;

	constructor(options: CustomerDisplayServiceOptions) {
		this.options = options;
		this.signaling = createSignalingClient(options.siteRestRoot, options.http);
	}
	start(): void {
		void this.refreshDisplays().catch((error) => {
			logger.warn('Customer display registry refresh failed', { context: { error } });
		});
	}
	configure(config: DisplayConfigInput): void {
		if (JSON.stringify(config) === JSON.stringify(this.config)) return;
		this.config = config;
		this.sessions.forEach((session) => session.refreshConfig());
	}
	async refreshDisplays(): Promise<void> {
		if (this.stopped) return;
		try {
			const displays = await this.signaling.listDisplays(this.options.deviceId);
			if (this.stopped) return;
			this.registryReadSucceeded = true;
			if (this.pairingCode && displays.some(({ id }) => !this.pairingDisplayIds.has(id))) {
				this.pairingCode = null;
			}
			this.displays = displays;
			const present = new Set(displays.map(({ id }) => id));
			for (const [id, session] of this.sessions) {
				if (!present.has(id)) {
					this.sessions.delete(id);
					session.close();
				}
			}
			for (const display of displays) {
				let session = this.sessions.get(display.id);
				if (!session) {
					session = new DisplaySession({
						display,
						deviceId: this.options.deviceId,
						signaling: this.signaling,
						createPeer: this.options.createPeer ?? createOfferer,
						getConfig: () => this.config,
						getCurrentState: () => this.currentState,
						onConnectionChange: () => {
							this.displays = this.displays.map((current) =>
								current.id === display.id
									? { ...current, connected: session?.isOpen ?? false }
									: current
							);
							this.emit();
							this.schedule();
						},
						now: this.options.now,
					});
					this.sessions.set(display.id, session);
				} else {
					session.updateDisplay(display);
				}
				if (!session.isOpen) {
					await session.poll();
					if (this.stopped) return;
				}
			}
			this.emit();
		} finally {
			this.schedule();
		}
	}
	async mintPairingCode(): Promise<PairingCode | null> {
		if (this.stopped) return null;
		const displays = await this.signaling.listDisplays(this.options.deviceId);
		if (this.stopped) return null;
		this.registryReadSucceeded = true;
		this.displays = displays;
		const code = await this.signaling.mintPairingCode(this.options.deviceId, this.options.storeId);
		this.pairingCode = code;
		this.pairingDisplayIds = new Set(displays.map(({ id }) => id));
		this.emit();
		this.schedule();
		return code;
	}
	async forget(displayId: string): Promise<void> {
		const session = this.sessions.get(displayId);
		try {
			await session?.forget();
			await this.signaling.forget(displayId);
		} catch (error) {
			this.schedule();
			throw error;
		}
		this.sessions.delete(displayId);
		this.displays = this.displays.filter(({ id }) => id !== displayId);
		this.emit();
		this.schedule();
	}
	publish(event: DisplayEvent): boolean {
		const now = (this.options.now ?? (() => new Date()))().getTime();
		if (
			event.action === 'cart.updated' ||
			(event.action === 'payment.state' && event.payload.state !== 'complete')
		) {
			this.suppressIdleUntil = 0;
		}
		if (event.action === 'display.idle' && now < this.suppressIdleUntil) {
			this.pendingIdle = event;
			if (this.idleTimer) clearTimeout(this.idleTimer);
			this.idleTimer = setTimeout(() => {
				const pendingIdle = this.pendingIdle;
				this.pendingIdle = null;
				this.idleTimer = null;
				if (pendingIdle) this.publish(pendingIdle);
			}, this.suppressIdleUntil - now);
			return false;
		}
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
		this.pendingIdle = null;
		const serialised = JSON.stringify(event);
		if (serialised === this.lastPublished) return false;
		if (event.action === 'payment.state' && event.payload.state === 'complete') {
			this.suppressIdleUntil = now + IDLE_AFTER_COMPLETE_MS;
		}
		this.lastPublished = serialised;
		this.currentState = event;
		this.sessions.forEach((session) => session.publish(event));
		return true;
	}

	getState(): CustomerDisplayState {
		return { displays: [...this.displays], pairingCode: this.activePairingCode() };
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private activePairingCode(): PairingCode | null {
		const now = (this.options.now ?? (() => new Date()))().getTime();
		if (this.pairingCode && this.pairingCode.expires_at * 1000 <= now) {
			this.pairingCode = null;
		}
		return this.pairingCode;
	}

	private emit(): void {
		this.listeners.forEach((listener) => listener());
	}

	private schedule(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (this.stopped) return;
		const needsPoll =
			!this.registryReadSucceeded ||
			this.activePairingCode() ||
			[...this.sessions.values()].some((session) => !session.isOpen);
		if (needsPoll) {
			this.timer = setTimeout(() => {
				void this.refreshDisplays().catch((error) => {
					logger.warn('Customer display registry poll failed', { context: { error } });
				});
			}, REGISTRY_POLL_MS);
		}
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
		this.pendingIdle = null;
		this.sessions.forEach((session) => session.close());
		this.sessions.clear();
	}
}
