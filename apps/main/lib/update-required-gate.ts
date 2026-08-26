import type { UpdateRequiredDetails } from '@wcpos/utils/sync-protocol';

/**
 * Per-site latch state for the server's protocol-gate refusal
 * (wcpos/woocommerce-pos#1752). The engine's transport latches itself shut;
 * this module carries the matching UI state so the layout can render the
 * blocking UpdateRequired screen. Keyed by site — the refusal is a property of
 * the store's plugin, not of a store/cashier scope — and canonicalized here so
 * every caller can pass the raw site URL it has.
 *
 * State lives per site key, never module-wide: a store switch to a different
 * site must not inherit another site's refusal (the same owner-scoping rule as
 * runtime 429 counters).
 */
export type UpdateRequiredState = (UpdateRequiredDetails & { status: number }) | null;

type Listener = (state: UpdateRequiredState) => void;

const states = new Map<string, UpdateRequiredState>();
const listeners = new Map<string, Set<Listener>>();

function siteKey(site: string): string {
	let canonical = site.trim().toLowerCase();
	if (canonical.startsWith('https://')) canonical = canonical.slice('https://'.length);
	else if (canonical.startsWith('http://')) canonical = canonical.slice('http://'.length);
	while (canonical.endsWith('/')) canonical = canonical.slice(0, -1);
	return canonical;
}

function emit(key: string): void {
	const state = states.get(key) ?? null;
	listeners.get(key)?.forEach((listener) => listener(state));
}

export function currentUpdateRequired(site: string): UpdateRequiredState {
	return states.get(siteKey(site)) ?? null;
}

export function subscribeUpdateRequired(site: string, listener: Listener): () => void {
	const key = siteKey(site);
	const set = listeners.get(key) ?? new Set<Listener>();
	set.add(listener);
	listeners.set(key, set);
	return () => {
		set.delete(listener);
		if (set.size === 0) listeners.delete(key);
	};
}

export function reportUpdateRequired(
	site: string,
	details: UpdateRequiredDetails & { status: number }
): void {
	const key = siteKey(site);
	states.set(key, details);
	emit(key);
}

/** A fresh engine for the site re-probes, so its construction clears the gate. */
export function clearUpdateRequired(site: string): void {
	const key = siteKey(site);
	if (!states.has(key)) return;
	states.delete(key);
	emit(key);
}
