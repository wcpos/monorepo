import { PREFLIGHT_BLOCK } from '@wcpos/hooks/use-http-client';

/**
 * Why a receipt email send failed, in the only two flavours the queue cares
 * about (#165).
 *
 *  - `connectivity`: the request never reached a server that could answer, or
 *    the server answered with something that will plausibly differ later. The
 *    email is durably queued and retried.
 *  - `permanent`: the server answered and refused. A bad address earns the same
 *    400 forever, so queuing it would only hide the failure from the cashier
 *    behind a promise that can never be kept. Surfaced immediately instead.
 */
export type EmailSendFailureKind = 'connectivity' | 'permanent';

export interface EmailSendFailure {
	kind: EmailSendFailureKind;
	/** Merchant-facing sentence: the server's own words where it gave any. */
	reason: string;
	/** Machine code, when the error carries one (`preflight-offline`, `rest_invalid_param`, …). */
	code?: string;
	/** HTTP status, when a response actually arrived. */
	status?: number;
	/**
	 * Whether a request actually left the device.
	 *
	 * False for the pre-flight blocks — offline, app asleep, requests paused for
	 * recovery — where nothing was sent. The retry budget exists to bound
	 * *futile server round trips*, so a block that never reached the network
	 * must not spend one: a till left asleep would otherwise exhaust an email's
	 * attempts without a single POST.
	 */
	attempted: boolean;
}

/**
 * Statuses that say "not now" rather than "not ever". Everything else in the
 * 4xx range is a verdict on the request itself and repeats forever.
 *
 * 423 Locked is in here because WordPress and its hosts use it for a temporary
 * resource lock, not a verdict on the address.
 */
const RETRYABLE_STATUSES = new Set([408, 423, 425, 429]);

/**
 * Pre-flight blocks (`request-state-manager`) that mean the transport is down.
 * The auth-required block is deliberately NOT here: it needs a human to log
 * in, and a silent queue would swallow that.
 */
const RETRYABLE_PREFLIGHT_BLOCKS = new Set<string>([
	PREFLIGHT_BLOCK.OFFLINE,
	PREFLIGHT_BLOCK.ASLEEP,
	PREFLIGHT_BLOCK.RECOVERING,
]);

/** Transport-level codes axios attaches when no response ever arrived. */
const RETRYABLE_TRANSPORT_CODES = new Set([
	'ECONNABORTED',
	'ECONNREFUSED',
	'ECONNRESET',
	'EAI_AGAIN',
	'EHOSTUNREACH',
	'ENETUNREACH',
	'ENOTFOUND',
	'EPIPE',
	'ETIMEDOUT',
	'ERR_NETWORK',
]);

/** Last resort for platforms that throw a bare `TypeError: Failed to fetch`. */
const TRANSPORT_MESSAGE = /network error|failed to fetch|load failed|timeout|timed out|offline/i;

type LooseError = {
	name?: unknown;
	message?: unknown;
	code?: unknown;
	blockCode?: unknown;
	isAxiosError?: unknown;
	isPreFlightBlocked?: unknown;
	wpMessage?: unknown;
	wpServerCode?: unknown;
	request?: unknown;
	response?: { status?: unknown; data?: unknown };
};

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() !== '' ? value : undefined;

function messageOf(error: LooseError): string {
	const data = error.response?.data as { message?: unknown } | undefined;
	return (
		asString(error.wpMessage) ??
		asString(data?.message) ??
		asString(error.message) ??
		'Unknown error'
	);
}

/**
 * Classify a failed `POST /orders/{id}/email`.
 *
 * The order of the tests matters. A response status is the strongest signal
 * there is — the server spoke — so it is read first; only when nothing answered
 * do the transport heuristics apply. The default is `permanent`: a queue that
 * swallows errors it does not understand is worse for a cashier than one that
 * shows them.
 */
export function classifyEmailSendError(error: unknown): EmailSendFailure {
	const loose = (error ?? {}) as LooseError;
	const reason = messageOf(loose);
	const serverCode = asString(loose.wpServerCode);

	const status = typeof loose.response?.status === 'number' ? loose.response.status : undefined;
	if (status !== undefined && status > 0) {
		const retryable = status >= 500 || RETRYABLE_STATUSES.has(status);
		return {
			kind: retryable ? 'connectivity' : 'permanent',
			reason,
			status,
			attempted: true,
			...(serverCode ? { code: serverCode } : {}),
		};
	}

	if (loose.isPreFlightBlocked === true) {
		const blockCode = asString(loose.blockCode);
		return {
			kind: blockCode && RETRYABLE_PREFLIGHT_BLOCKS.has(blockCode) ? 'connectivity' : 'permanent',
			reason,
			// The request state manager rejected this before it reached the network.
			attempted: false,
			...(blockCode ? { code: blockCode } : {}),
		};
	}

	// A request cancelled mid-flight (the auth handler cancels in-flight requests
	// while it refreshes) never got a verdict — try again later.
	if (loose.name === 'CanceledError' || loose.name === 'AbortError') {
		return { kind: 'connectivity', reason, attempted: loose.request !== undefined };
	}

	const transportCode = asString(loose.code);
	if (transportCode && RETRYABLE_TRANSPORT_CODES.has(transportCode)) {
		return { kind: 'connectivity', reason, code: transportCode, attempted: true };
	}

	// An axios error that carries a `request` but no `response` went out and got
	// nothing back — a transport failure. Without a `request` it never left:
	// axios throws the same shape for a bad URL or an invalid option, and those
	// do not improve when the wifi returns, so they surface instead of queueing.
	if (loose.isAxiosError === true && loose.response === undefined && loose.request !== undefined) {
		return {
			kind: 'connectivity',
			reason,
			attempted: true,
			...(transportCode ? { code: transportCode } : {}),
		};
	}

	if (TRANSPORT_MESSAGE.test(reason)) {
		return {
			kind: 'connectivity',
			reason,
			attempted: true,
			...(transportCode ? { code: transportCode } : {}),
		};
	}

	return {
		kind: 'permanent',
		reason,
		attempted: true,
		...((serverCode ?? transportCode) ? { code: serverCode ?? transportCode } : {}),
	};
}
