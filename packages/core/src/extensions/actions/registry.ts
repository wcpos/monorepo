import type { ActionEvent, ActionHook, ActionHookRegistration, ActionHookState } from './types';

/** A tap must not feel stuck. */
export const ACTION_BUDGET_MS: Record<ActionEvent, number> = {
	'cart.line.add': 1500,
	'cart.line.update': 1500,
	'checkout.tender.commit': 5_000, // a card leg already waits longer
};
/** Three failures switch off a repeatedly broken hook for this session. */
export const ACTION_HOOK_STRIKES = 3;
export type Registration<E extends ActionEvent> = Required<ActionHookRegistration> & {
	hook: ActionHook<E>;
};
// Stored under the event they were registered for, so the hook's own event type is recovered
// by `getActionHooks(event)`; the map itself cannot express that, hence the two casts below.
type StoredRegistration = Required<ActionHookRegistration> & { hook: ActionHook<never> };
const registrations = new Map<ActionEvent, Map<string, StoredRegistration>>();
const snapshots = new Map<ActionEvent, readonly StoredRegistration[]>();
const states = new Map<string, ActionHookState>();
const tokens = new WeakSet<object>();
declare const dispatchTokenBrand: unique symbol;
export type DispatchToken = { readonly [dispatchTokenBrand]: true };
export function createDispatchToken(): DispatchToken {
	const token = {} as DispatchToken;
	tokens.add(token);
	return token;
}
export function isDispatchToken(value: unknown): boolean {
	return typeof value === 'object' && value !== null && tokens.has(value);
}
export function registerActionHook<E extends ActionEvent>(
	event: E,
	hook: ActionHook<E>,
	{ id, tier, order = 0 }: ActionHookRegistration
): void {
	const entries = registrations.get(event) ?? new Map<string, StoredRegistration>();
	if (entries.has(id)) {
		if (process.env.NODE_ENV === 'production')
			throw new Error(`Action hook "${id}" already registered for "${event}"`);
		// Replace rather than throw: a Fast Refresh re-evaluates the registering module, and
		// so does every test that imports it. Throwing would make both of those fatal.
		console.warn(`Action hook "${id}" re-registered for "${event}" — replacing.`);
	}
	entries.set(id, { id, tier, order, hook: hook as unknown as ActionHook<never> });
	registrations.set(event, entries);
	snapshots.delete(event);
}
/**
 * Extensions first, guards last; order then id within each tier. Stable until registration or
 * disablement. Guards run innermost, right before the writer, so a guard judges the payload the
 * writer will write — after every extension's rewrite — and an extension can never slip a value
 * past a guard that already passed (the review of #2454 found the outermost order allowed that).
 * A disabled extension leaves the chain; a disabled guard STAYS, so the dispatcher refuses for
 * it (a money-path guard that silently dropped out after three strikes would fail open).
 */
export function getActionHooks<E extends ActionEvent>(event: E): readonly Registration<E>[] {
	if (!snapshots.has(event)) {
		snapshots.set(
			event,
			[...(registrations.get(event)?.values() ?? [])]
				.filter(({ id, tier }) => tier === 'guard' || !getActionHookState(id).disabled)
				.sort(
					(a, b) =>
						Number(a.tier === 'guard') - Number(b.tier === 'guard') ||
						a.order - b.order ||
						a.id.localeCompare(b.id)
				)
		);
	}
	return snapshots.get(event) as unknown as readonly Registration<E>[];
}
export function getActionHookState(id: string): ActionHookState {
	return { ...(states.get(id) ?? { strikes: 0, disabled: false }) };
}
export function recordActionHookStrike(id: string, _reason: string): ActionHookState {
	const strikes = getActionHookState(id).strikes + 1;
	const state = { strikes, disabled: strikes >= ACTION_HOOK_STRIKES };
	states.set(id, state);
	if (state.disabled) snapshots.clear();
	return state;
}
/** Test-only escape hatch: clear registrations and strikes. */
export function resetActionRegistry(): void {
	registrations.clear();
	snapshots.clear();
	states.clear();
}
/** Test-only: clear strikes but keep registrations (a writer test cannot re-register the hooks it imports). */
export function resetActionHookStrikes(): void {
	states.clear();
	snapshots.clear();
}
