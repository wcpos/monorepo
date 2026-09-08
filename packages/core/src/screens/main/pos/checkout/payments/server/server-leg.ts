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
export interface ServerLegResponse {
	payment: PaymentRow;
	order?: OrderPaymentSummary;
}
export interface ServerLegState {
	phase: 'idle' | 'creating' | 'polling' | 'cancelling' | 'final';
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
		? (response as { status?: number; data?: PaymentRefusalBody })
		: undefined;
}
function deadline(row: PaymentRow, base: number) {
	return Math.min(base + DEADLINE_MS, row.expires_at ? Date.parse(row.expires_at) : Infinity);
}
export function createServerLeg(deps: ServerLegDeps, input: ServerLegInput) {
	const created = input.row.created_at_gmt;
	const createdAt = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(created) ? created : `${created}Z`);
	let state: ServerLegState = {
		phase: input.resume ? 'polling' : 'idle',
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
	const finish = (outcome: ServerLegState['outcome']) => {
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
	const schedule = (delay: number, route: 'intent' | 'status' = 'status') => {
		clearTimer();
		if (active())
			timer = deps.setTimeout(() => {
				timer = null;
				void (route === 'intent' ? request('intent') : tick());
			}, delay);
	};
	const applyResponse = async (
		data: ServerLegResponse,
		seq: number,
		changes: Partial<ServerLegState> = {}
	) => {
		if (!current(seq)) return false;
		await mirror(data, seq);
		if (!current(seq)) return false;
		setState({ ...changes, row: data.payment, ...(data.order ? { order: data.order } : {}) });
		const status = data.payment.status;
		if (status === 'captured' || status === 'failed' || status === 'voided') finish(status);
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
	async function request(route: Route, reason?: string) {
		if (!active()) return;
		clearTimer();
		const seq = ++sequence;
		const url = `orders/${input.orderId}/payments/${input.row.id}/${route}`;
		let data: ServerLegResponse;
		try {
			const response =
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
			data = response.data as ServerLegResponse;
		} catch (error) {
			if (current(seq)) await handleError(error, route, seq);
			return;
		}
		if (!current(seq)) return;
		if (!(await applyResponse(data, seq, { consecutiveErrors: 0, unstable: false }))) return;
		setState({
			phase: 'polling',
			capturing: false,
			consecutiveErrors: 0,
			unstable: false,
			...(route === 'intent' ? { deadlineAt: deadline(data.payment, deps.now()) } : {}),
			...(route === 'void' ? { releaseAvailable: true } : {}),
		});
		await afterResponse(route);
	}
	async function handleError(error: unknown, route: Route, seq: number) {
		const response = errorResponse(error);
		const body = response?.data;
		const code = body?.code;
		const changes: Partial<ServerLegState> = {};
		if (code && code !== 'wcpos_payment_locked' && code !== 'wcpos_invalid_transition') {
			const detail = body?.data.detail as { code?: string; message?: string } | undefined;
			changes.error = {
				code: code === 'wcpos_provider_error' ? (detail?.code ?? code) : code,
				message:
					(code === 'wcpos_provider_error' ? detail?.message : undefined) ?? body?.message ?? code,
			};
		}

		if (
			body?.data?.payment &&
			!(await applyResponse({ payment: body.data.payment, order: body.data.order }, seq, changes))
		)
			return;
		if (!current(seq)) return;
		if (code === 'wcpos_payment_locked') {
			setState({ capturing: false, phase: 'polling' });
			schedule((body?.data.retry_after ?? POLL_CADENCE_MS / 1000) * 1000);
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
		if (
			code?.startsWith('wcpos_') &&
			response?.status !== undefined &&
			response.status >= 400 &&
			response.status < 500
		) {
			// A void the server cannot find is a leg that never existed there: the
			// cashier cancelled before the intent landed, which is a void, not a failure.
			const row =
				route === 'void' && code === 'wcpos_payment_not_found'
					? { ...state.row, status: 'voided' as const, failure_reason: null }
					: {
							...state.row,
							status: 'failed' as const,
							failure_reason: code === 'wcpos_payment_not_found' ? 'not_found' : code,
						};
			await applyResponse({ payment: row, order: body?.data.order }, seq);
			return;
		}
		const count = state.consecutiveErrors + 1;
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
		sequence++;
		clearTimer();
		setState({
			phase: 'cancelling',
			capturing: false,
			captureFailed: false,
			cancelRequested: true,
		});
		if (reason === 'cashier') event('Cancel requested by cashier');
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
		event('Leg released', 'warning');
		const row = { ...state.row, status: 'voided' as const, failure_reason: 'released' };
		finish('released');
		await mirror({ payment: row, order: state.order }, sequence);
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
