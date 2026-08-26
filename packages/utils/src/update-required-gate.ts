import type { UpdateRequiredDetails } from './sync-protocol';

/** Per-site UI state for the server's protocol-gate refusal. */
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
