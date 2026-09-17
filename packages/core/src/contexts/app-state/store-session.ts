import type { EngineScopeSwitcher } from './engine-scope-port';
import type { CurrentSessionIDs, hydrateUserSession, SessionAppState } from './hydration-steps';

/**
 * The five fields an active store session consists of. Login and store-switch
 * write them together; `hasStoreSession` is the one predicate every gate reads
 * (the root `Stack.Protected`, the auth redirect, `useStoreSession`), and the
 * session producers (`login`, `switchUserSessionStore`) refuse to commit a
 * session that lacks any of them, so nothing that assumes the rest ever mounts
 * on a partial one (#2112). Its own module because both the React context and
 * the hydration steps need it.
 */
export const STORE_SESSION_FIELDS = [
	'storeDB',
	'store',
	'site',
	'wpCredentials',
	'extraData',
] as const;

export type StoreSessionField = (typeof STORE_SESSION_FIELDS)[number];

type SessionFields = Partial<Record<StoreSessionField, unknown>>;

/** The session fields that are absent or null, in `STORE_SESSION_FIELDS` order. */
export function missingStoreSessionFields(state: SessionFields): StoreSessionField[] {
	return STORE_SESSION_FIELDS.filter((field) => !state[field]);
}

/** True when every field of an active store session is present. */
export function hasStoreSession(state: SessionFields): boolean {
	return missingStoreSessionFields(state).length === 0;
}

/**
 * Thrown by `assertStoreSession`. Carries the missing fields so the producer
 * that catches it can report the dedicated AUTH131 (with the merchant toast)
 * instead of the caller's generic failure code.
 */
export class IncompleteStoreSessionError extends Error {
	readonly missingFields: StoreSessionField[];

	constructor(missingFields: StoreSessionField[]) {
		super(`Store session incomplete: missing ${missingFields.join(', ')}`);
		this.name = 'IncompleteStoreSessionError';
		this.missingFields = missingFields;
	}
}

/**
 * Throws when a freshly hydrated session is missing any field, naming them.
 * Used by the producers so a broken store is refused BEFORE its pointer is
 * persisted or the engine is switched to it, leaving the current session intact.
 */
export function assertStoreSession(state: SessionFields): void {
	const missing = missingStoreSessionFields(state);
	if (missing.length > 0) {
		throw new IncompleteStoreSessionError(missing);
	}
}

type HydratedStoreSession = Awaited<ReturnType<typeof hydrateUserSession>>;

/**
 * The one place the durable session pointer is committed, in the one order that keeps a
 * cashier off a partial store: refuse an incomplete session (AUTH131 at the caller), move the
 * engine to the new scope (a failed transition aborts with durable state untouched), THEN
 * persist the pointer. `null` signs out: the pointer is cleared and the sessionless state
 * returned; the engine is not touched. Login and embedded boot pass no engine switcher because
 * they run before the engine port exists (#2112). Persistence failure after activation
 * propagates; there is no rollback.
 */
export async function commitStoreSession(
	appState: SessionAppState,
	next: { ids: CurrentSessionIDs; session: HydratedStoreSession } | null,
	switchEngineScope?: EngineScopeSwitcher
): Promise<HydratedStoreSession> {
	if (next) {
		assertStoreSession(next.session);
		await switchEngineScope?.(next.session);
	}
	await appState.set('current', () => next?.ids ?? null);
	return next?.session ?? SIGNED_OUT_SESSION;
}


export const SIGNED_OUT_SESSION: HydratedStoreSession = {
	site: undefined,
	wpCredentials: undefined,
	store: undefined,
	storeDB: undefined,
	extraData: undefined,
};
