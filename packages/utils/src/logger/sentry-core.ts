import { redactSensitiveText } from './redact';

export type SentryCaptureInput = {
	message: string;
	code?: number | string;
	context?: unknown;
};

export type TelemetryConsent = 'undecided' | 'allowed' | 'denied';

/**
 * Captures logged before the merchant's consent is known. On web and Electron
 * consent is read from the STORE document and reaches the sink through an
 * effect in the root layout, so a render error caught in the very first commit
 * — the #2112 login failure — arrived while the sink was uninitialised and was
 * dropped even on a till that had allowed reporting. Held inputs are sent the
 * moment consent becomes `allowed` and discarded when it becomes `denied`;
 * nothing leaves the device before the merchant has said yes. Bounded: a
 * render loop before consent must not grow memory.
 */
export const PENDING_CAPTURE_LIMIT = 20;

export function createPendingCaptures() {
	const pending: SentryCaptureInput[] = [];
	return {
		hold(input: SentryCaptureInput): void {
			if (pending.length >= PENDING_CAPTURE_LIMIT) pending.shift();
			pending.push(input);
		},
		/** Empties the queue and returns what it held, oldest first. */
		drain(): SentryCaptureInput[] {
			return pending.splice(0, pending.length);
		},
	};
}

// Public DSN for the same Sentry project used by the desktop main process.
export const SENTRY_DSN =
	'https://39233e9d1e5046cbb67dae52f807de5f@o159038.ingest.sentry.io/1220733';

type SentryEventLike = {
	message?: string;
	exception?: { values?: { value?: string }[] };
	request?: { url?: string };
	breadcrumbs?: { data?: Record<string, unknown> }[];
	extra?: Record<string, unknown>;
	contexts?: Record<string, unknown>;
};

export function describeBareException<T extends SentryEventLike>(
	event: T,
	hint?: { originalException?: unknown }
): T {
	try {
		const err = hint?.originalException;
		const bare = event.exception?.values?.some(
			({ value }) => !value || value === 'No error message'
		);
		if (err === undefined || !bare) return event;
		const fields = err as { name?: unknown; code?: unknown; stack?: unknown } | null;
		const thrown: Record<string, unknown> = { keys: [], hasStack: false };
		// Every string leaves through the scrubber: a `code` or key can carry a token, and a web
		// stack names the merchant's origin on every frame.
		const text = (value: unknown, max: number) => scrubComponentStack(String(value)).slice(0, max);
		const readers: Record<string, () => unknown> = {
			typeof: () => typeof err,
			// Symbol.toStringTag is user-settable, so the tag is a string like any other.
			tag: () => text(Object.prototype.toString.call(err), 100),
			constructor: () => (fields?.constructor?.name ? text(fields.constructor.name, 100) : null),
			name: () => (typeof fields?.name === 'string' ? text(fields.name, 100) : null),
			code: () =>
				typeof fields?.code === 'number'
					? fields.code
					: typeof fields?.code === 'string'
						? text(fields.code, 100)
						: null,
			keys: () =>
				err !== null && typeof err === 'object'
					? Object.keys(err)
							.slice(0, 20)
							.map((key) => text(key, 60))
					: [],
			hasStack: () => typeof fields?.stack === 'string' && fields.stack.length > 0,
			stackHead: () => (thrown.hasStack ? text(fields?.stack, 500) : null),
			string: () => text(err, 200),
		};
		for (const [key, read] of Object.entries(readers)) {
			try {
				thrown[key] = read();
			} catch {
				thrown[key] = thrown[key] ?? null;
			}
		}
		event.contexts = { ...event.contexts, thrown };
	} catch {
		// A diagnostic must never hide the event it was meant to explain.
	}
	return event;
}

export function prepareEvent<T extends SentryEventLike>(
	event: T,
	hint?: { originalException?: unknown }
): T {
	return scrubEvent(describeBareException(event, hint));
}

function stripOrigin(url: string): string {
	try {
		const parsedUrl = new URL(url);
		return redactSensitiveText(`${parsedUrl.pathname}${parsedUrl.search}`);
	} catch {
		return redactSensitiveText(url);
	}
}

function scrubUrlValues(value: unknown): unknown {
	if (typeof value === 'string') return stripOrigin(value);
	if (Array.isArray(value)) return value.map(scrubUrlValues);
	if (value === null || typeof value !== 'object' || value instanceof Error) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, nestedValue]) => [key, scrubUrlValues(nestedValue)])
	);
}

function scrubComponentStack(stack: string): string {
	return redactSensitiveText(stack.replace(URL_ORIGIN, '{}'));
}

export function scrubEvent<T extends SentryEventLike>(event: T): T {
	// The title Sentry shows is the message or the exception value; a log line can
	// embed a Bearer token or a `user:pass@host` URL, and `extra` being scrubbed
	// does nothing for the copy in the title.
	if (typeof event.message === 'string') {
		event.message = redactSensitiveText(event.message);
	}
	for (const exception of event.exception?.values ?? []) {
		if (typeof exception.value === 'string') {
			exception.value = redactSensitiveText(exception.value);
		}
	}
	if (event.request?.url) {
		event.request.url = stripOrigin(event.request.url);
	}
	for (const breadcrumb of event.breadcrumbs ?? []) {
		if (typeof breadcrumb.data?.url === 'string') {
			breadcrumb.data.url = stripOrigin(breadcrumb.data.url);
		}
	}
	if (event.extra) {
		event.extra = Object.fromEntries(
			Object.entries(event.extra).map(([key, value]) => [key, scrubUrlValues(value)])
		);
	}
	// A React component stack names the bundle URL on every frame on web, and
	// that URL is the merchant's origin. The stack is not itself a URL, so the
	// per-value stripper above never fires on it; strip the origins embedded in
	// it, in both places the boundary report puts it.
	const react = event.contexts?.react;
	if (react && typeof react === 'object' && 'componentStack' in react) {
		const stack = (react as { componentStack?: unknown }).componentStack;
		if (typeof stack === 'string') {
			(react as { componentStack?: unknown }).componentStack = scrubComponentStack(stack);
		}
	}
	const context = event.extra?.context;
	if (context && typeof context === 'object' && 'componentStack' in context) {
		const stack = (context as { componentStack?: unknown }).componentStack;
		if (typeof stack === 'string') {
			(context as { componentStack?: unknown }).componentStack = scrubComponentStack(stack);
		}
	}
	return event;
}

const URL_ORIGIN = /\bhttps?:\/\/[^\s"'/]+/gi;
const UUID = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi;
const QUOTED = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const INTEGER = /\b\d+\b/g;

/**
 * The message with everything per-store or per-record replaced by `{}`: URL
 * origins (a merchant's hostname must not make one failure class into one
 * issue per store), UUIDs, quoted strings and integers.
 */
export function messageTemplate(message: string): string {
	return message
		.replace(URL_ORIGIN, '{}')
		.replace(UUID, '{}')
		.replace(QUOTED, '{}')
		.replace(INTEGER, '{}');
}

/** A quoted string that is an identifier or a dotted path, e.g. `'price'`, `"items.0.name"`. */
const QUOTED_IDENTIFIER = /^(['"])[A-Za-z_$][\w$.-]{0,63}\1$/;

/**
 * `messageTemplate` for an error thrown during render. A quoted identifier is
 * kept: it names the property or component the code tripped over
 * (`reading 'price'`), which is the bug's identity, and folding it would put
 * every undefined-property read in the app into one issue. Any other quoted
 * string (a name, an email, a store title) is per-record noise and is still
 * templated, so merchant data never becomes a grouping key.
 */
export function renderErrorTemplate(message: string): string {
	return message
		.replace(URL_ORIGIN, '{}')
		.replace(UUID, '{}')
		.replace(QUOTED, (quoted) => (QUOTED_IDENTIFIER.test(quoted) ? quoted : '{}'))
		.replace(INTEGER, '{}');
}

/**
 * Sentry grouping key. A registry code names one condition, so it groups alone;
 * the `*999` catch-alls add the message template so unrelated failures do not
 * share an issue; an HTTP failure (the client stamps `context.endpoint`) adds
 * method + endpoint template so a 503 on `/products` and one on `/orders` are
 * two issues, whatever the code. A push rejection (the engine stamps
 * `context.type: 'push.error'` with the server's `reason`) adds collection +
 * status + reason: `registration-error-email-exists` on a customer create and
 * `woocommerce_rest_invalid_coupon` on an order update are different bugs, and
 * one Sentry issue for both (2HT) hid six of them behind whichever came first.
 * A render error caught by an `ErrorBoundary` (`context.type: 'render.error'`)
 * groups by the thrown message alone: the same `useStoreSession` throw surfaces
 * from whichever component rendered first, and one issue per screen would hide
 * that it is one bug (#2112).
 */
function fingerprintFor(message: string, code: string, context: unknown) {
	const fields =
		context !== null && typeof context === 'object' ? (context as Record<string, unknown>) : {};
	if (fields.type === 'render.error') {
		// `context.message` is the thrown error's own message (the serialised-error
		// shape the hydration logger uses too); the log message merely prefixes it.
		const thrownMessage = typeof fields.message === 'string' ? fields.message : message;
		return [code, renderErrorTemplate(thrownMessage)];
	}
	const endpoint = fields.endpoint;
	if (typeof endpoint === 'string' && endpoint.length > 0) {
		const method = typeof fields.method === 'string' ? fields.method : '';
		return [code, method, messageTemplate(endpoint)];
	}
	if (fields.type === 'push.error') {
		const part = (value: unknown) => (value === undefined || value === null ? '' : String(value));
		return [code, part(fields.collection), part(fields.status), part(fields.reason)];
	}
	return code.endsWith('999') ? [code, messageTemplate(message)] : [code];
}

export function buildCaptureOptions({ message, code, context }: SentryCaptureInput) {
	// A React component stack goes where Sentry's own React integration puts it,
	// so the issue page renders it as a stack rather than as an `extra` string.
	const componentStack =
		context !== null && typeof context === 'object' && 'componentStack' in context
			? context.componentStack
			: undefined;
	return {
		level: 'error' as const,
		...(code !== undefined && {
			tags: { errorCode: String(code) },
			fingerprint: fingerprintFor(message, String(code), context),
		}),
		...(typeof componentStack === 'string' && { contexts: { react: { componentStack } } }),
		extra: { message, context },
	};
}
