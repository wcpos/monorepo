import { isFinalPaymentStatus } from '@wcpos/order-math';
import { MoneyCommandError } from '@wcpos/query';
import { isDefinitiveMoneyRefusal, moneyRefusalOf } from '@wcpos/sync-core';
import { holdLiveTab, LiveTabNotOwnedError } from '@wcpos/database/live-tab';
import { log } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type {
	OrderPaymentSummary,
	PaymentEvent,
	PaymentRefusalBody,
	PaymentRow,
} from '@wcpos/order-math';

const POLL_CADENCE_MS = 2000; // Wait after each response, not on a fixed interval.
const BACKOFF_MS = [2000, 4000, 8000, 15000]; // Bound transport pressure without giving up.
const UNSTABLE_AFTER = 3; // Surface sustained connection loss to the cashier.
const DEADLINE_MS = 300_000; // Check finality before requesting cancellation at five minutes.
// A 4xx on intent that is about the request, not the session: 401/403/407/429 (an
// expired token, a proxy, rate limiting) stay transport and are retried.
const INTENT_REFUSAL_STATUSES = new Set([400, 404, 405, 409, 410, 413, 415, 422]);
export interface ServerLegResponse {
	payment: PaymentRow;
	order?: OrderPaymentSummary;
}
export interface ServerLegState {
	phase: 'idle' | 'creating' | 'polling' | 'cancelling' | 'final';
	intentId: string;
	row: PaymentRow;
	order?: OrderPaymentSummary;
	outcome: null | 'captured' | 'failed' | 'voided' | 'released';
	cancelRequested: boolean;
	releaseAvailable: boolean;
	unstable: boolean;
	consecutiveErrors: number;
	deadlineAt: number;
	deadlineHandled: boolean;
	capturing: boolean;
	captureFailed: boolean;
	error: { code: string; message: string } | null;
	clientEvents: PaymentEvent[];
}
export interface ServerLegDeps {
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
	get: (url: string) => Promise<{ data: unknown }>;
	setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
	now: () => number;
	mirror: (response: ServerLegResponse) => Promise<void>;
	onFinal?: (state: ServerLegState) => void;
	/** Retire a journaled command that is known never to have run (see `cancelledLockedIntent`). */
	retire?: (kind: 'intent', target: string) => Promise<void>;
}
export interface ServerLegInput {
	orderId: number;
	row: PaymentRow;
	reader: string | null;
	resume: boolean;
}
type Route = 'intent' | 'status' | 'capture' | 'void';
function errorResponse(error: unknown) {
	if (!error || typeof error !== 'object') return undefined;
	const response = (error as { response?: unknown }).response;
	return response && typeof response === 'object'
		? (response as {
				status?: number;
				data?: PaymentRefusalBody & {
					data: PaymentRefusalBody['data'] & { payment_id?: unknown };
				};
			})
		: undefined;
}
// A date the provider or an old row wrote badly must not switch the deadline off:
// NaN compares false against everything, so it is ignored rather than trusted.
function deadline(row: PaymentRow, base: number) {
	const expires = row.expires_at ? Date.parse(row.expires_at) : NaN;
	return Math.min(base + DEADLINE_MS, Number.isNaN(expires) ? Infinity : expires);
}
export function createServerLeg(deps: ServerLegDeps, input: ServerLegInput) {
	const created = input.row.created_at_gmt ?? '';
	const parsedCreated = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(created) ? created : `${created}Z`);
	const createdAt = Number.isNaN(parsedCreated) ? deps.now() : parsedCreated;
	let state: ServerLegState = {
		phase: input.resume ? 'polling' : 'idle',
		intentId: input.row.id,
		row: input.row,
		outcome: null,
		cancelRequested: Boolean(input.row.void_requested_at),
		releaseAvailable: Boolean(input.row.void_requested_at),
		unstable: false,
		consecutiveErrors: 0,
		deadlineAt: input.resume ? deadline(input.row, createdAt) : 0,
		deadlineHandled: false,
		capturing: false,
		captureFailed: false,
		error: null,
		clientEvents: [],
	};
	const listeners = new Set<() => void>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let sequence = 0;
	let stopped = false;
	let captureAttempted = false;
	let deadlineRead = false;
	let awaitingRejoinedStatus = false;
	const active = () => !stopped && state.phase !== 'final';
	const current = (seq: number) => active() && seq === sequence;
	const setState = (changes: Partial<ServerLegState>) => {
		state = { ...state, ...changes };
		listeners.forEach((listener) => listener());
	};
	const event = (message: string, level: PaymentEvent['level'] = 'info') => {
		setState({
			clientEvents: [
				...state.clientEvents,
				{ t: new Date(deps.now()).toISOString(), level, message },
			],
		});
	};
	const clearTimer = () => {
		if (timer !== null) deps.clearTimeout(timer);
		timer = null;
	};
	// The row id of this leg's intent while the store has not answered it (a lock, a transport
	// failure, a cancel that overtook it). If the leg then ends voided (its void answered `voided`
	// or not found), that intent is retired from the journal: a later recovery or Try again must
	// never re-send it and authorize a sale the cashier cancelled. A resumed leg's intent was
	// answered before.
	let unansweredIntent: string | null = input.resume ? null : input.row.id;
	const finish = (outcome: ServerLegState['outcome']) => {
		unansweredIntent = null;
		clearTimer();
		sequence++;
		setState({ phase: 'final', outcome, capturing: false, releaseAvailable: false });
		deps.onFinal?.(state);
	};
	// A local write failure must not turn a known server capture into an intent retry.
	const mirror = async (data: ServerLegResponse, seq: number) => {
		try {
			await deps.mirror(data);
		} catch (error) {
			if (stopped || seq !== sequence) return;
			setState({
				error: {
					code: 'mirror_failed',
					message: error instanceof Error ? error.message : 'mirror_failed',
				},
			});
		}
	};
	// The reason the last void went out with, so a re-send after a held lock carries it again.
	let voidReason: string | undefined;
	const schedule = (delay: number, route: Route = 'status') => {
		clearTimer();
		if (active())
			timer = deps.setTimeout(() => {
				timer = null;
				void (route === 'status' ? tick() : request(route, voidReason));
			}, delay);
	};
	const applyResponse = async (
		data: ServerLegResponse,
		seq: number,
		changes: Partial<ServerLegState> = {},
		route?: Route
	) => {
		if (!current(seq)) return false;
		await mirror(data, seq);
		if (!current(seq)) return false;
		if (awaitingRejoinedStatus && route === 'status') {
			const created = data.payment.created_at_gmt ?? '';
			const parsedCreated = Date.parse(
				/(?:Z|[+-]\d\d:\d\d)$/i.test(created) ? created : `${created}Z`
			);
			changes = {
				...changes,
				cancelRequested: state.cancelRequested || Boolean(data.payment.void_requested_at),
				releaseAvailable: state.releaseAvailable || Boolean(data.payment.void_requested_at),
				deadlineAt: deadline(
					data.payment,
					Number.isNaN(parsedCreated) ? deps.now() : parsedCreated
				),
			};
			awaitingRejoinedStatus = false;
		}
		setState({ ...changes, row: data.payment, ...(data.order ? { order: data.order } : {}) });
		const status = data.payment.status;
		if (status === 'voided' && unansweredIntent !== null) {
			// The retirement is awaited before the leg is final: a failed journal write keeps the
			// leg live with its reason and the next status read retires again, so a voided leg never
			// leaves a re-sendable intent behind.
			try {
				await deps.retire?.('intent', unansweredIntent);
			} catch (error) {
				if (!current(seq)) return false;
				setState({
					error: {
						code: 'retire_failed',
						message: error instanceof Error ? error.message : 'retire_failed',
					},
				});
				schedule(POLL_CADENCE_MS);
				return false;
			}
			if (!current(seq)) return false;
		}
		if (isFinalPaymentStatus(status)) finish(status);
		return current(seq);
	};
	const afterResponse = async (route: Route) => {
		if (deadlineRead && route === 'status') {
			deadlineRead = false;
			if (!state.cancelRequested) {
				await cancel('deadline');
				return;
			}
		}
		if (
			state.row.status === 'authorized' &&
			!state.cancelRequested &&
			!captureAttempted &&
			!state.captureFailed
		) {
			await capture();
			return;
		}
		if (!state.captureFailed) schedule(route === 'intent' ? 0 : POLL_CADENCE_MS);
	};
	// A cancel pressed while the intent is still out waits here: a void that raced
	// the intent could win on the server, be answered "not found", and leave the
	// intent to create a live reader action nobody polls — a customer charged
	// after the till said "cancelled". The void goes out once the intent settles.
	let pendingCancel: string | null = null;
	let intentInFlight = false;
	const voidAfterIntent = async () => {
		const reason = pendingCancel;
		pendingCancel = null;
		if (reason === null || !active()) return false;
		sequence++;
		clearTimer();
		setState({ phase: 'cancelling', capturing: false });
		await request('void', reason);
		return true;
	};
	async function request(route: Route, reason?: string) {
		if (!active()) return;
		clearTimer();
		const seq = ++sequence;
		const url = `orders/${input.orderId}/payments/${state.row.id}/${route}`;
		if (route === 'void') voidReason = reason;
		let data: ServerLegResponse;
		if (route === 'intent') intentInFlight = true;
		try {
			let response: { data: unknown };
			const release = route === 'capture' ? holdLiveTab('payment') : undefined;
			try {
				response =
					route === 'status'
						? await deps.get(url)
						: await deps.post(
								url,
								route === 'intent'
									? { payment: input.row, context: { reader: input.reader } }
									: route === 'capture'
										? { context: {} }
										: { reason }
							);
			} finally {
				release?.();
			}
			data = response.data as ServerLegResponse;
		} catch (error) {
			if (error instanceof LiveTabNotOwnedError) {
				stop();
				log.info(error.message, { code: ERROR_CODES.REGISTER_TAB_NOT_OWNED });
				return;
			}
			intentInFlight = false;
			if (current(seq)) await handleError(error, route, seq);
			return;
		}
		intentInFlight = false;
		// Answered: the poster settles the intent's journal entry with this answer.
		if (route === 'intent') unansweredIntent = null;
		if (!current(seq)) return;
		if (!(await applyResponse(data, seq, { consecutiveErrors: 0, unstable: false }, route))) return;
		setState({
			phase: 'polling',
			capturing: false,
			consecutiveErrors: 0,
			unstable: false,
			...(route === 'intent' ? { deadlineAt: deadline(data.payment, deps.now()) } : {}),
			...(route === 'void' ? { releaseAvailable: true } : {}),
		});
		if (route === 'intent' && (await voidAfterIntent())) return;
		await afterResponse(route);
	}
	async function handleError(error: unknown, route: Route, seq: number) {
		// The poster refused the command before it left the till: the order changed since the
		// cashier approved it, or its pre-flight failed. Nothing reached the store and the journal
		// holds nothing; a retry would only re-create it under the stale approval. The leg ends
		// here with the reason, and the cashier chooses again.
		if (
			error instanceof MoneyCommandError &&
			(error.reason === 'order_changed' || error.reason === 'preflight_failed')
		) {
			pendingCancel = null;
			unansweredIntent = null;
			const reason = { code: error.reason, message: error.message };
			event(error.reason, 'error');
			await applyResponse(
				{ payment: { ...state.row, status: 'failed' as const, failure_reason: error.reason } },
				seq,
				{ error: reason }
			);
			return;
		}
		const response = errorResponse(error);
		const body = response?.data;
		const code = body?.code;
		const changes: Partial<ServerLegState> = {};
		if (code && code !== 'wcpos_payment_locked' && code !== 'wcpos_invalid_transition') {
			const detail = body?.data?.detail as { code?: string; message?: string } | undefined;
			changes.error = {
				code: code === 'wcpos_provider_error' ? (detail?.code ?? code) : code,
				message:
					(code === 'wcpos_provider_error' ? detail?.message : undefined) ?? body?.message ?? code,
			};
		}

		if (
			body?.data?.payment &&
			!(await applyResponse(
				{ payment: body.data.payment, order: body.data.order },
				seq,
				changes,
				route
			))
		)
			return;
		if (!current(seq)) return;
		if (
			route === 'intent' &&
			code === 'wcpos_payment_in_flight' &&
			typeof body?.data?.payment_id === 'string'
		) {
			// A definitive answer (the poster settled this intent): the leg follows the live one.
			unansweredIntent = null;
			awaitingRejoinedStatus = true;
			setState({
				row: { ...state.row, id: body.data.payment_id },
				phase: 'polling',
				consecutiveErrors: 0,
				unstable: false,
				// The 409 was an answer, not a refusal: the live leg starts with no error.
				error: null,
				// Placeholder until the first adopted status supplies its dates.
				deadlineAt: deadline(state.row, deps.now()),
			});
			event('Joined the payment already in progress', 'info');
			if (await voidAfterIntent()) return;
			schedule(0);
			return;
		}
		if (code === 'wcpos_payment_locked') {
			const delay = (body?.data?.retry_after ?? POLL_CADENCE_MS / 1000) * 1000;
			// The lock was held and nothing ran (ADR 0040 §1.3): the money command stays journaled,
			// and only a re-send of it answers it. A status read cannot: an intent that never ran
			// reads `not_found`, a capture leaves the row authorized. So the same command goes out
			// again after `retry_after`, in the phase it was sent from. A cancel pressed while that
			// intent was out wins: nothing ran, so the void goes out now instead.
			if (route === 'intent' && (await voidAfterIntent())) return;
			if (route === 'status') setState({ capturing: false, phase: 'polling' });
			else
				setState(
					route === 'intent'
						? { phase: 'creating' }
						: route === 'void'
							? { phase: 'cancelling', capturing: false }
							: { phase: 'polling', capturing: true }
				);
			schedule(delay, route);
			return;
		}
		if (code === 'wcpos_invalid_transition' && (route === 'capture' || route === 'void')) {
			setState({ capturing: false, phase: 'polling' });
			schedule(0);
			return;
		}
		if (!body?.data?.payment && changes.error) setState(changes);
		if (code === 'wcpos_provider_error' && route === 'capture') {
			setState({ phase: 'polling', capturing: false, captureFailed: true });
			clearTimer();
			return;
		}
		// Only the contract's own codes are definitive. An auth or gateway 4xx (expired
		// JWT, a proxy answering for the site) says nothing about the leg, which is
		// still live on the server, so it is retried like a dropped connection.
		// An intent the store or the provider REFUSED is the exception: no leg exists to
		// keep polling for, and the same request will be refused the same way (a currency
		// the merchant cannot take, a payment the ledger rejects). It lands as failed with
		// the message, so the cashier reads the reason instead of "Connection unstable".
		const refusedIntent =
			route === 'intent' &&
			response?.status !== undefined &&
			INTENT_REFUSAL_STATUSES.has(response.status);
		// A money command (intent, capture, void) ends the leg only on the store's own decision,
		// the rule its journal uses (sync-core `isDefinitiveMoneyRefusal`): an answer the journal
		// keeps for a re-send (a 426, a proxy's bare 4xx) must not end the leg, or a later re-send
		// could authorize after the cashier was told it failed. A status read is no command.
		const definitive = route === 'status' || isDefinitiveMoneyRefusal(moneyRefusalOf(error));
		if (
			definitive &&
			(code?.startsWith('wcpos_') || refusedIntent) &&
			response?.status !== undefined &&
			response.status >= 400 &&
			response.status < 500
		) {
			// A void the server cannot find is a leg that never existed there: the
			// cashier cancelled before the intent landed, which is a void, not a failure.
			const localVoid = route === 'void' && code === 'wcpos_payment_not_found';
			// The server wrote no event for a row it refused to create, so the refusal is
			// logged here: it is what the cashier reads under the stepper and what Copy carries.
			if (!localVoid)
				event(changes.error?.message ?? body?.message ?? `HTTP ${response.status}`, 'error');
			if (awaitingRejoinedStatus) {
				finish(localVoid ? 'voided' : 'failed');
				return;
			}
			const row = localVoid
				? { ...state.row, status: 'voided' as const, failure_reason: null }
				: {
						...state.row,
						status: 'failed' as const,
						// A refusal without a code (a proxy's bare 4xx) still names why the leg ended.
						failure_reason: code === 'wcpos_payment_not_found' ? 'not_found' : (code ?? 'refused'),
					};
			await applyResponse({ payment: row, order: body?.data?.order }, seq);
			return;
		}
		// An intent the cashier already cancelled is not retried: the server may or may
		// not hold the row, and the void answers that either way (200, or "not found").
		if (route === 'intent' && (await voidAfterIntent())) return;
		// An intent that keeps failing in transit is not retried past the leg's deadline: it is
		// cancelled, as the status path cancels at the deadline (the void answers either way).
		if (route === 'intent' && !state.cancelRequested && deps.now() >= state.deadlineAt) {
			setState({ phase: 'creating', capturing: false });
			await cancel('deadline');
			return;
		}
		const count = state.consecutiveErrors + 1;
		// A capture that never reached the server is not an attempt: the next status
		// read that still shows `authorized` issues it again (under the same backoff).
		if (route === 'capture') captureAttempted = false;
		setState({
			capturing: false,
			consecutiveErrors: count,
			unstable: count >= UNSTABLE_AFTER,
			phase: route === 'intent' ? 'creating' : 'polling',
		});
		if (count === UNSTABLE_AFTER) event('Connection unstable', 'warning');
		if (deadlineRead && !state.cancelRequested) {
			deadlineRead = false;
			await cancel('deadline');
			return;
		}
		schedule(
			BACKOFF_MS[Math.min(count - 1, BACKOFF_MS.length - 1)],
			route === 'intent' ? 'intent' : 'status'
		);
	}
	async function tick() {
		if (!active()) return;
		if (!state.deadlineHandled && deps.now() >= state.deadlineAt) {
			deadlineRead = true;
			setState({ deadlineHandled: true });
			event('Deadline reached', 'warning');
		}
		await request('status');
	}
	async function start() {
		if (!active() || state.phase !== 'idle') return;
		setState({ phase: 'creating', deadlineAt: deadline(input.row, deps.now()) });
		await request('intent');
	}
	async function cancel(reason = 'cashier') {
		if (
			!active() ||
			state.cancelRequested ||
			(state.phase !== 'polling' && state.phase !== 'creating')
		)
			return;
		if (reason === 'cashier') event('Cancel requested by cashier');
		if (intentInFlight) {
			// The intent has not answered yet: remember the cancel, void when it does.
			pendingCancel = reason;
			setState({
				phase: 'cancelling',
				capturing: false,
				captureFailed: false,
				cancelRequested: true,
			});
			return;
		}
		sequence++;
		clearTimer();
		setState({
			phase: 'cancelling',
			capturing: false,
			captureFailed: false,
			cancelRequested: true,
		});
		await request('void', reason);
	}
	async function capture() {
		if (
			!active() ||
			state.phase !== 'polling' ||
			state.capturing ||
			state.cancelRequested ||
			state.row.status !== 'authorized'
		)
			return;
		captureAttempted = true;
		setState({ capturing: true, captureFailed: false, error: null });
		await request('capture');
	}
	async function checkNow() {
		if (!active() || state.phase !== 'polling' || state.capturing) return;
		sequence++;
		clearTimer();
		await tick();
	}
	async function release() {
		if (!active() || !state.releaseAvailable) return;
		sequence++;
		clearTimer();
		const seq = sequence;
		// The local void is written BEFORE the leg is final: a final leg can be
		// dismissed, and a dismissed leg whose ledger row is still live would only be
		// resumed by the next render. A failed write leaves the leg live, with the
		// release still on offer and the reason in `error`.
		const row = { ...state.row, status: 'voided' as const, failure_reason: 'released' };
		try {
			await deps.mirror({ payment: row, order: state.order });
		} catch (error) {
			if (!current(seq)) return;
			setState({
				error: {
					code: 'mirror_failed',
					message: error instanceof Error ? error.message : 'mirror_failed',
				},
			});
			schedule(POLL_CADENCE_MS);
			return;
		}
		if (!current(seq)) return;
		event('Leg released', 'warning');
		setState({ row });
		finish('released');
	}
	function stop() {
		stopped = true;
		sequence++;
		clearTimer();
	}
	if (input.resume) schedule(0);
	return {
		start,
		cancel,
		capture,
		checkNow,
		release,
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
export type ServerLeg = ReturnType<typeof createServerLeg>;
