import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import type {
	OrderPaymentSummary,
	PaymentMethodDescriptor,
	PaymentRow,
	PaymentTransport,
} from '@wcpos/order-math';

import {
	createDeviceLeg,
	type DeviceLeg,
	type DeviceLegState,
	offlineProviderRefs,
} from '../../screens/main/pos/checkout/payments/device/device-leg';
import { getDriver, listDrivers } from '../payment-drivers/registry';
import { createServerLeg } from '../../screens/main/pos/checkout/payments/server/server-leg';

import type { OfflineSettlement } from '../payment-drivers/types';
import type {
	ServerLeg,
	ServerLegDeps,
	ServerLegResponse,
	ServerLegState,
} from '../../screens/main/pos/checkout/payments/server/server-leg';

const logger = getLogger(['wcpos', 'terminal-payments']);
const SETTLEMENT_RETRY_DELAYS = [5000, 30000, 120000];
const hasProviderRefs = (refs: Record<string, unknown>) =>
	Object.values(refs).some((value) => value !== null && value !== undefined);

export interface TerminalPaymentsServiceOptions {
	factories?: { server?: typeof createServerLeg; device?: typeof createDeviceLeg };
	patchAndEnqueue?: (orderUuid: string, row: PaymentRow) => Promise<OrderPaymentSummary | void>;
	isOnline?: () => boolean;
	resolveOrderId?: (orderUuid: string) => Promise<number | null>;
	http: Pick<ServerLegDeps, 'get' | 'post'>;
	mirror: (orderUuid: string, response: ServerLegResponse) => Promise<void>;
	onCaptured?: (orderUuid: string, order: OrderPaymentSummary | undefined) => void;
	/**
	 * The store's price decimals for resumed legs, read at resume time (a getter, so a
	 * setting changed mid-session — the store document is patched in place — is honoured).
	 */
	dp?: number | (() => number);
	now?: ServerLegDeps['now'];
	setTimeout?: ServerLegDeps['setTimeout'];
	clearTimeout?: ServerLegDeps['clearTimeout'];
}
interface ResumeInput {
	dp?: number;
	orderUuid: string;
	orderId: number;
	orderNumber: string;
	row: PaymentRow;
}
interface BeginInput extends ResumeInput {
	reader: string | null;
	method?: PaymentMethodDescriptor;
	transport?: PaymentTransport;
	offline?: boolean;
	tipEligibleMinor?: number | null;
}
type TerminalLeg = ServerLeg | DeviceLeg;
export type TerminalLegState = (ServerLegState | DeviceLegState) & {
	orderNumber: string;
	reader: string | null;
};
export class TerminalPaymentsService {
	private legs = new Map<
		string,
		{ leg: TerminalLeg; orderNumber: string; reader: string | null }
	>();
	private listeners = new Set<() => void>();
	private snapshot: ReadonlyMap<string, TerminalLegState> = new Map();
	private offline = new Map<
		string,
		{
			input: ResumeInput;
			refs?: Record<string, unknown>;
			persisted: boolean;
			retries: number;
			timer?: ReturnType<typeof setTimeout>;
		}
	>();
	/**
	 * Payment rows whose settled failure has already been written to the log.
	 * It lives here, not in the checkout hook, because a final failed leg stays in
	 * the service after checkout unmounts: a fresh hook would otherwise consume the
	 * retained leg and write the same row again on every reopen.
	 */
	private narratedFailures = new Set<string>();
	private unsubscribers: (() => void)[] = [];
	private stopped = false;
	private flushing: Promise<void> | null = null;
	private pendingFlush = false;
	constructor(private options: TerminalPaymentsServiceOptions) {
		for (const driver of listDrivers()) {
			const unsubscribe = driver.settleOffline$?.subscribe((event) => {
				const entry = this.offline.get(event.rowId);
				if (entry?.input.row.provider === driver.provider) void this.settleOffline(event);
			});
			if (unsubscribe) this.unsubscribers.push(unsubscribe);
		}
	}
	async bootstrap(
		methodId: string,
		context: Record<string, unknown>
	): Promise<Record<string, unknown> | null> {
		const response = await this.options.http.post(`payment-methods/${methodId}/bootstrap`, {
			context,
		});
		const handoff = (response.data as { handoff?: Record<string, unknown> | null }).handoff;
		return handoff ? { ...handoff, method_id: methodId } : null;
	}
	trackOffline(input: ResumeInput): void {
		const existing = this.offline.get(input.row.id);
		if (['captured', 'failed', 'voided'].includes(input.row.status)) {
			if (existing?.timer !== undefined)
				(this.options.clearTimeout ?? clearTimeout)(existing.timer);
			this.offline.delete(input.row.id);
			return;
		}
		if (existing) {
			existing.input = input;
			if (existing.persisted && hasProviderRefs(input.row.provider_refs))
				existing.refs = input.row.provider_refs;
			return;
		}
		this.offline.set(input.row.id, {
			input,
			retries: 0,
			persisted: true,
			refs: hasProviderRefs(input.row.provider_refs) ? input.row.provider_refs : undefined,
		});
	}
	private async settleOffline(event: OfflineSettlement): Promise<void> {
		const entry = this.offline.get(event.rowId);
		if (!entry) return;
		entry.refs = event.provider_refs;
		entry.persisted = false;
		await this.flushOffline();
	}
	flushOffline(): Promise<void> {
		// An external trigger starts a fresh bounded retry budget, without adding a second timer.
		for (const entry of this.offline.values()) {
			if (entry.timer === undefined) entry.retries = 0;
		}
		return this.requestOfflineFlush();
	}
	private requestOfflineFlush(): Promise<void> {
		if (this.flushing) {
			this.pendingFlush = true;
			return this.flushing;
		}
		this.flushing = (async () => {
			try {
				do {
					this.pendingFlush = false;
					await this.flushOfflinePass();
				} while (this.pendingFlush && !this.stopped);
			} finally {
				this.flushing = null;
			}
		})();
		return this.flushing;
	}
	private async flushOfflinePass(): Promise<void> {
		for (const entry of this.offline.values()) {
			if (
				this.stopped ||
				!entry.refs ||
				!hasProviderRefs(entry.refs) ||
				entry.input.row.status !== 'authorized'
			)
				continue;
			const refs = entry.refs;
			try {
				const { orderUuid, row } = entry.input;
				// Persist the settlement reference before a request so a reload can reconcile it.
				const settled = { ...row, provider_refs: offlineProviderRefs(refs) };
				if (!entry.persisted) {
					await this.options.patchAndEnqueue?.(orderUuid, settled);
					entry.persisted = entry.refs === refs;
				}
				if (this.stopped || !this.options.isOnline?.()) continue;
				const id = this.options.resolveOrderId
					? await this.options.resolveOrderId(orderUuid)
					: entry.input.orderId;
				if (this.stopped || !id) continue;
				const response = await this.options.http.post(`orders/${id}/payments/${row.id}/capture`, {
					context: { provider_refs: refs },
				});
				if (this.stopped) return;
				const data = response.data as ServerLegResponse;
				await this.options.mirror(orderUuid, data);
				if (
					data.payment.status === 'captured' ||
					data.payment.status === 'failed' ||
					data.payment.status === 'voided'
				) {
					if (entry.timer !== undefined) (this.options.clearTimeout ?? clearTimeout)(entry.timer);
					this.offline.delete(row.id);
				}
			} catch (error) {
				logger.warn('Offline payment settlement failed', {
					context: { paymentId: entry.input.row.id, error: getErrorMessage(error) },
				});
				if (
					!this.stopped &&
					entry.timer === undefined &&
					entry.retries < SETTLEMENT_RETRY_DELAYS.length
				) {
					entry.timer = (
						this.options.setTimeout ??
						((callback: () => void, ms: number) => setTimeout(callback, ms))
					)(() => {
						entry.timer = undefined;
						void this.requestOfflineFlush();
					}, SETTLEMENT_RETRY_DELAYS[entry.retries++]);
				}
			}
		}
	}
	/**
	 * True the first time it is called for a row, false afterwards. The caller
	 * writes the failure row only when it wins.
	 */
	claimFailureNarration(rowId: string): boolean {
		if (this.narratedFailures.has(rowId)) return false;
		this.narratedFailures.add(rowId);
		return true;
	}
	begin(input: BeginInput): TerminalLeg {
		return this.create(input, false);
	}
	resume(input: ResumeInput): TerminalLeg | undefined {
		if (
			input.row.capture_mode === 'device' &&
			input.row.recorded_offline &&
			input.row.status === 'authorized'
		) {
			this.trackOffline(input);
			void this.flushOffline();
			return undefined;
		}
		const existing = this.legs.get(input.orderUuid)?.leg;
		if (existing?.getState().row.id === input.row.id) return existing;
		return this.create({ ...input, reader: null }, true);
	}
	private create(input: BeginInput, resume: boolean): TerminalLeg {
		const existing = this.legs.get(input.orderUuid)?.leg;
		if (existing && existing.getState().phase !== 'final')
			throw new Error('Order already has a live terminal leg');
		existing?.dispose();
		const deps = {
			...this.options.http,
			now: this.options.now ?? Date.now,
			// Wrapped, not passed: the leg calls `deps.setTimeout(...)`, and a browser's
			// window.setTimeout invoked with another `this` throws "Illegal invocation"
			// — the first status read after a successful intent never fired (found live).
			setTimeout:
				this.options.setTimeout ?? ((callback: () => void, ms: number) => setTimeout(callback, ms)),
			clearTimeout:
				this.options.clearTimeout ??
				((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer)),
			mirror: (response: ServerLegResponse) => this.options.mirror(input.orderUuid, response),
			onFinal: (state: ServerLegState | DeviceLegState) => {
				if (state.row.recorded_offline && state.row.status === 'authorized') {
					this.trackOffline({ ...input, row: state.row });
					void this.flushOffline();
				}
				if (state.outcome === 'captured') this.options.onCaptured?.(input.orderUuid, state.order);
			},
		};
		const device = input.row.capture_mode === 'device';
		if (device && !resume && this.readersInUse().has(`device:${input.row.provider}`))
			throw new Error('Device method already in use');
		if (input.offline) this.trackOffline(input);
		const leg = device
			? (this.options.factories?.device ?? createDeviceLeg)(
					{
						...deps,
						driver: getDriver(input.row.provider),
						patchAndEnqueue: (row) => {
							if (!this.options.patchAndEnqueue)
								throw new Error('Offline payment writer unavailable');
							return this.options.patchAndEnqueue(input.orderUuid, row);
						},
					},
					{
						dp:
							input.dp ??
							(typeof this.options.dp === 'function' ? this.options.dp() : this.options.dp) ??
							2,
						orderId: input.orderId,
						row: input.row,
						resume,
						method: input.method,
						transport: input.transport ?? (input.row.transport as PaymentTransport),
						offline: input.offline ?? false,
						tipEligibleMinor: input.tipEligibleMinor ?? null,
					}
				)
			: (this.options.factories?.server ?? createServerLeg)(deps, {
					orderId: input.orderId,
					row: input.row,
					reader: input.reader,
					resume,
				});
		this.legs.set(input.orderUuid, { leg, orderNumber: input.orderNumber, reader: input.reader });
		leg.subscribe(() => this.publish());
		this.publish();
		if (!resume || device) void leg.start();
		return leg;
	}
	get(orderUuid: string): TerminalLegState | null {
		return this.snapshot.get(orderUuid) ?? null;
	}
	leg(orderUuid: string): TerminalLeg | undefined {
		return this.legs.get(orderUuid)?.leg;
	}
	dismiss(orderUuid: string): void {
		const entry = this.legs.get(orderUuid);
		if (!entry || entry.leg.getState().phase !== 'final') return;
		entry.leg.dispose();
		this.legs.delete(orderUuid);
		this.publish();
	}
	readersInUse(): Map<string, { orderUuid: string; orderNumber: string }> {
		const readers = new Map<string, { orderUuid: string; orderNumber: string }>();
		this.snapshot.forEach((state, orderUuid) => {
			// The server records the curated reader on the row, so a resumed leg (which
			// began on another till or before a reload) still names the reader it holds.
			const reader =
				state.row.capture_mode === 'device'
					? `device:${state.row.provider}`
					: (state.row.provider_refs?.reader ?? state.reader);
			if (state.phase !== 'final' && reader)
				readers.set(reader, { orderUuid, orderNumber: state.orderNumber });
		});
		return readers;
	}
	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	getSnapshot = () => this.snapshot;
	private publish(): void {
		this.snapshot = new Map(
			[...this.legs].map(([uuid, { leg, orderNumber, reader }]) => [
				uuid,
				{ ...leg.getState(), orderNumber, reader },
			])
		);
		this.listeners.forEach((listener) => listener());
	}
	stop(): void {
		this.stopped = true;
		this.offline.forEach((entry) => {
			if (entry.timer !== undefined) (this.options.clearTimeout ?? clearTimeout)(entry.timer);
		});
		this.unsubscribers.forEach((fn) => fn());
		this.legs.forEach(({ leg }) => leg.stop());
	}
}
