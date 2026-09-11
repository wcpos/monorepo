import { toMinor } from '@wcpos/order-math';
import type { OrderPaymentSummary, PaymentRefusalBody, PaymentRow } from '@wcpos/order-math';

import type {
	CollectInput,
	CollectResult,
	PaymentDriver,
} from '../../../../../../services/payment-drivers/types';
import type { ServerLegDeps, ServerLegResponse, ServerLegState } from '../server/server-leg';

export type DeviceLegState = Omit<ServerLegState, 'phase'> & {
	phase: 'idle' | 'creating' | 'collecting' | 'confirming' | 'capturing' | 'final';
	cancelOnDevice: boolean;
	resumed: boolean;
	failureReason: string | null;
};
export type DeviceLegInput = Omit<CollectInput, 'handoff' | 'method'> & {
	orderId: number;
	resume: boolean;
	method?: CollectInput['method'];
};
export type DeviceLegDeps = Omit<ServerLegDeps, 'onFinal'> & {
	driver: PaymentDriver | undefined;
	patchAndEnqueue: (row: PaymentRow) => Promise<OrderPaymentSummary | void>;
	onFinal?: (state: DeviceLegState) => void;
};
/** Offline rows must satisfy the ledger wire contract, not silently drop opaque refs. */
export function offlineProviderRefs(refs: Record<string, unknown>): PaymentRow['provider_refs'] {
	const result: PaymentRow['provider_refs'] = {};
	for (const [key, value] of Object.entries(refs)) {
		if (value !== null && typeof value !== 'string')
			throw new Error('Invalid offline provider reference');
		result[key] = value;
	}
	return result;
}
export function createDeviceLeg(deps: DeviceLegDeps, input: DeviceLegInput) {
	let state: DeviceLegState = {
		phase: 'idle',
		row: input.row,
		outcome: null,
		cancelRequested: false,
		resumed: input.resume,
		failureReason: null,
		cancelOnDevice: deps.driver?.capabilities.cancel === 'on_device',
		releaseAvailable: false,
		unstable: false,
		consecutiveErrors: 0,
		deadlineAt: 0,
		deadlineHandled: false,
		capturing: false,
		captureFailed: false,
		error: null,
		clientEvents: [],
	};
	const listeners = new Set<() => void>();
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let result: CollectResult | null = null;
	let inFlight = false;
	let cancelReason = 'cashier';
	const active = () => !stopped && state.phase !== 'final';
	const set = (changes: Partial<DeviceLegState>) => {
		state = { ...state, ...changes };
		listeners.forEach((fn) => fn());
	};
	const finish = (outcome: DeviceLegState['outcome'], changes: Partial<DeviceLegState> = {}) => {
		if (!active()) return;
		deps.clearTimeout(timer!);
		set({ ...changes, phase: 'final', outcome, capturing: false });
		deps.onFinal?.(state);
	};
	const errorState = (error: unknown) => {
		const body = (error as { response?: { data?: PaymentRefusalBody } })?.response?.data;
		const detail = body?.data?.detail as { code?: string; message?: string } | undefined;
		set({
			error: {
				code: detail?.code ?? body?.code ?? 'device_error',
				message:
					detail?.message ??
					body?.message ??
					(error instanceof Error ? error.message : 'Payment failed'),
			},
		});
		return body;
	};
	const apply = async (response: ServerLegResponse) => {
		if (!active()) return;
		// Keep the server's outcome even if RxDB cannot mirror it; never recollect money.
		try {
			await deps.mirror(response);
		} catch (error) {
			if (active()) errorState(error);
		}
		if (!active()) return;
		const changes = { row: response.payment, ...(response.order ? { order: response.order } : {}) };
		const status = response.payment.status;
		// Publish finality with the mirrored row, not after returning through another await:
		// checkout can unmount when the paid row lands, before it consumes the outcome.
		if (status === 'captured' || status === 'failed' || status === 'voided') {
			finish(status === 'voided' && result?.outcome === 'declined' ? 'failed' : status, changes);
		} else set(changes);
	};
	const url = (route: string) => `orders/${input.orderId}/payments/${input.row.id}/${route}`;
	async function confirm() {
		if (!active() || inFlight || (state.phase === 'collecting' && !result)) return;
		inFlight = true;
		set({
			phase: 'confirming',
			capturing: true,
			captureFailed: false,
			error: null,
			failureReason: result?.failure_reason ?? null,
		});
		try {
			if (input.resume && input.row.status === 'authorized') {
				const response = state.cancelRequested
					? await deps.post(url('void'), { reason: cancelReason })
					: await deps.get(url('status'));
				await apply(response.data as ServerLegResponse);
				if (!active()) return;
				throw new Error('Payment is not final on the store');
			} else if (input.resume) {
				const lost = {
					t: new Date(deps.now()).toISOString(),
					level: 'error' as const,
					message: 'Reader session was lost',
				};
				const row: PaymentRow = {
					...state.row,
					status: 'failed',
					failure_reason: 'reader_session_lost',
					events: [...(state.row.events ?? []), lost],
				};
				// A failed local write must not let dismissal immediately resume the pending row.
				await deps.mirror({ payment: row });
				if (active()) {
					set({ row });
					finish('failed');
				}
			} else if (input.offline) {
				if (!result) return;
				const authorized = result.outcome === 'authorized';
				const dp = input.dp;
				if (
					authorized &&
					result.amount !== null &&
					toMinor(result.amount, dp) < toMinor(input.row.amount, dp)
				)
					throw new Error('Offline authorization is below the payment amount');
				if (result.outcome === 'captured')
					throw new Error('Offline collection must return authorization');
				const row: PaymentRow = {
					...state.row,
					recorded_offline: true,
					status: authorized ? 'authorized' : result.outcome === 'declined' ? 'failed' : 'voided',
					// Reader-added tips are not applied to the sale until the server echoes them.
					amount: input.row.amount,
					provider_refs: { ...offlineProviderRefs(result.provider_refs), payment_intent: null },
					failure_reason: result.failure_reason ?? null,
					updated_at_gmt: new Date(deps.now()).toISOString(),
				};
				const order = await deps.patchAndEnqueue(row);
				if (active()) {
					set({ row, ...(order ? { order } : {}) });
					finish(authorized ? 'captured' : (row.status as 'failed' | 'voided'));
				}
			} else {
				if (result?.outcome === 'declined') {
					// Let the provider report its failure before voiding a still-live intent.
					const response = await deps.get(url('status'));
					await apply(response.data as ServerLegResponse);
					if (!active()) return;
				}
				const success = result?.outcome === 'captured' || result?.outcome === 'authorized';
				set({ phase: success ? 'capturing' : 'confirming' });
				const response = await deps.post(
					url(success ? 'capture' : 'void'),
					success && result
						? {
								context: {
									provider_refs: result.provider_refs,
									receipt: result.receipt,
									transport: result.transport,
									amount: result.amount,
								},
							}
						: {
								reason:
									result?.outcome === 'declined'
										? (result.failure_reason ?? 'card_declined')
										: cancelReason,
							}
				);
				await apply(response.data as ServerLegResponse);
				if (!active()) return;
				throw new Error('Payment is not final on the store');
			}
		} catch (error) {
			if (!active()) return;
			const body = errorState(error);
			if (body?.data?.payment) {
				await apply({ payment: body.data.payment, order: body.data.order });
				if (!active()) return;
			}
			set({ captureFailed: true, capturing: false });
		} finally {
			inFlight = false;
		}
	}
	async function start() {
		if (!active() || state.phase !== 'idle') return;
		if (input.resume) {
			await confirm();
			return;
		}
		if (!deps.driver || !input.method) {
			set({ error: { code: 'device_driver_missing', message: 'Device driver or method missing' } });
			finish('failed');
			return;
		}
		set({ phase: 'creating', deadlineAt: deps.now() + 300000 });
		timer = deps.setTimeout(() => {
			if (active()) {
				set({ deadlineHandled: true });
				void cancel('deadline');
			}
		}, 300000);
		let handoff: CollectInput['handoff'] = null;
		if (!input.offline) {
			try {
				const response = await deps.post(url('intent'), {
					payment: input.row,
					context: { transport: input.transport },
				});
				const data = response.data as ServerLegResponse & { handoff?: CollectInput['handoff'] };
				await apply(data);
				if (!active()) return;
				handoff = data.handoff ?? null;
			} catch (error) {
				if (!active()) return;
				const body = errorState(error);
				if (body?.data?.payment)
					await apply({ payment: body.data.payment, order: body.data.order });
				if (!active()) return;
				// No collection has started: void the possibly-created intent before offering a new row.
				await confirm();
				return;
			}
		}
		if (!active()) return;
		if (state.cancelRequested) {
			result = {
				outcome: 'cancelled',
				provider_refs: {},
				receipt: {},
				amount: null,
				transport: input.transport,
			};
			await confirm();
			return;
		}
		set({ phase: 'collecting' });
		try {
			result = await deps.driver.collect({
				dp: input.dp,
				row: state.row,
				method: input.method,
				transport: input.transport,
				handoff,
				offline: input.offline,
				tipEligibleMinor: input.offline ? null : input.tipEligibleMinor,
			});
		} catch (error) {
			if (!active()) return;
			errorState(error);
			result = {
				outcome: 'declined',
				failure_reason: 'reader_error',
				provider_refs: {},
				receipt: {},
				amount: null,
				transport: input.transport,
			};
		}
		if (active()) await confirm();
	}
	async function cancel(reason = 'cashier') {
		if (!active() || state.cancelRequested || inFlight || result) return;
		cancelReason = reason;
		set({ cancelRequested: true });
		if (input.resume && input.row.status === 'authorized') {
			await confirm();
			return;
		}
		if (state.phase === 'collecting' && deps.driver?.capabilities.cancel === 'app') {
			try {
				await deps.driver.cancel?.();
			} catch (error) {
				if (active()) {
					errorState(error);
					set({ cancelRequested: false });
				}
			}
		}
	}
	function stop() {
		stopped = true;
		if (timer) deps.clearTimeout(timer);
	}
	return {
		start,
		cancel,
		capture: confirm,
		checkNow: confirm,
		release: async () => {},
		stop,
		dispose: () => {
			stop();
			listeners.clear();
		},
		getState: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
export type DeviceLeg = ReturnType<typeof createDeviceLeg>;
