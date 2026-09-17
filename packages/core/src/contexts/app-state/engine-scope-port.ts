import type { hydrateUserSession } from './hydration-steps';

/**
 * Host port for the sync engine's scope transition. The app that owns the
 * engine (apps/main AppStack) registers a switcher; the store-switch flow
 * awaits it BETWEEN session hydration and the session commit, so an engine
 * that cannot reach the new scope aborts before persistence. Activation can
 * precede persistence; a later persistence failure does not roll it back.
 */
export type EngineScopeSwitcher = (
	session: Awaited<ReturnType<typeof hydrateUserSession>>
) => Promise<void>;

let engineScopeSwitcher: EngineScopeSwitcher | null = null;

export function registerEngineScopeSwitcher(switcher: EngineScopeSwitcher | null): void {
	engineScopeSwitcher = switcher;
}

export function getEngineScopeSwitcher(): EngineScopeSwitcher | null {
	return engineScopeSwitcher;
}
