import { holdLiveTab, LiveTabNotOwnedError } from '@wcpos/database/live-tab';
import { log } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
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
// How long a device leg waits for a card before the till gives up. A Bluetooth reader waits
// forever on its own; the cashier can always cancel sooner. Two minutes covers a customer digging
// for a card and clears a forgotten sale before the next one (Paul, 2026-10-07; was 5 minutes).
export const DEVICE_LEG_DEADLINE_MS = 120000;
// When the SDK refuses a cancel, either the reader already has the card and is confirming (a
// result is seconds away) or the SDK was re-initialised under the leg and nothing will ever
// come. This is how long the leg waits for that result before treating the reader as gone.
export const CANCEL_GRACE_MS = 30000;
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
	let graceTimer: ReturnType<typeof setTimeout> | undefined;
	let result: CollectResult | null = null;
	// When the reader answered. A failed local write is retried through capture(), and
	// the approval time must not drift to the time of the retry.
	let approvedAt: string | null = null;
	let inFlight = false;
	let cancelReason = 'cashier';
	// The store refused to mint the intent: a void that follows is bookkeeping, not an outcome.
	let intentRefused = false;
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
			finish(
				status === 'voided' && (result?.outcome === 'declined' || intentRefused)
					? 'failed'
					: status,
				changes
			);
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
				const timestamp = new Date(deps.now()).toISOString();
				approvedAt ??= timestamp;
				const row: PaymentRow = {
					...state.row,
					recorded_offline: true,
					status: authorized ? 'authorized' : result.outcome === 'declined' ? 'failed' : 'voided',
					// Reader-added tips are not applied to the sale until the server echoes them.
					amount: input.row.amount,
					// Keep what the row already carries (the reader it was minted for): the driver's
					// refs describe the offline intent, not the whole row.
					provider_refs: {
						...state.row.provider_refs,
						...offlineProviderRefs(result.provider_refs),
						payment_intent: null,
					},
					failure_reason: result.failure_reason ?? null,
					...(authorized ? { authorized_at_gmt: approvedAt } : {}),
					updated_at_gmt: timestamp,
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
				let response: { data: unknown };
				const release = success ? holdLiveTab('payment') : undefined;
				try {
					response = await deps.post(
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
				} finally {
					release?.();
				}
				await apply(response.data as ServerLegResponse);
				if (!active()) return;
				throw new Error('Payment is not final on the store');
			}
		} catch (error) {
			if (!active()) return;
			if (error instanceof LiveTabNotOwnedError) {
				stop();
				log.info(error.message, { code: ERROR_CODES.REGISTER_TAB_NOT_OWNED });
				return;
			}
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
		set({ phase: 'creating', deadlineAt: deps.now() + DEVICE_LEG_DEADLINE_MS });
		timer = deps.setTimeout(() => {
			if (active()) {
				set({ deadlineHandled: true });
				void cancel('deadline');
			}
		}, DEVICE_LEG_DEADLINE_MS);
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
				intentRefused = true;
				if (body?.data?.payment)
					await apply({ payment: body.data.payment, order: body.data.order });
				if (!active()) return;
				// Nothing reached the reader. Void whatever the store may have minted, but the leg
				// ends failed where it stood and the cashier reads the store's refusal of the intent,
				// not the void's bookkeeping (a 400 here once showed as "Approved · payment not
				// found", three steps along — WisePad 3 run, 2026-10-06).
				try {
					const response = await deps.post(url('void'), { reason: 'intent_refused' });
					await apply(response.data as ServerLegResponse);
				} catch {
					// A row the store never created needs no void.
				}
				if (active()) finish('failed');
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
		let release: (() => void) | undefined;
		try {
			try {
				approvedAt = null;
				// collect may capture on the reader; preparation above owns no payment hold.
				release = holdLiveTab('payment');
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
				if (error instanceof LiveTabNotOwnedError) {
					stop();
					log.info(error.message, { code: ERROR_CODES.REGISTER_TAB_NOT_OWNED });
					return;
				}
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
		} finally {
			// Keep the reader result protected until confirmation has persisted it.
			release?.();
		}
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
				if (!active() || result) return;
				errorState(error);
				// Offline there is no intent to void and the reader's stored payment forwards
				// regardless: the leg must live until the reader answers.
				if (input.offline) {
					set({ cancelRequested: false });
					return;
				}
				// Give a result that may be seconds away its chance (LEDGER rule 9: never void
				// against a confirmation in flight). After that the reader is gone — the SDK was
				// re-initialised under the leg, the session lost — and the till cannot sit on a
				// leg nothing will end (a walk-away did exactly that for 10+ minutes, 2026-10-06).
				// Void the intent, after which a late approval can no longer capture, and finish.
				await new Promise<void>((resolve) => {
					graceTimer = deps.setTimeout(resolve, CANCEL_GRACE_MS);
				});
				if (!active() || result) return;
				result = {
					outcome: 'cancelled',
					failure_reason: 'reader_unresponsive',
					provider_refs: {},
					receipt: {},
					amount: null,
					transport: input.transport,
				};
				await confirm();
			}
		}
	}
	function stop() {
		stopped = true;
		if (timer) deps.clearTimeout(timer);
		if (graceTimer) deps.clearTimeout(graceTimer);
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
