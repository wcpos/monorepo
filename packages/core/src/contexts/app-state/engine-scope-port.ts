/**
 * Host port for the sync engine's scope transition. The app that owns the
 * engine (apps/main AppStack) registers a switcher; the store-switch flow
 * awaits it BETWEEN session hydration and the session commit, so an engine
 * that cannot reach the new scope aborts the switch before any durable state
 * changes — engine, persisted session and UI always move together.
 */
export type EngineScopeSwitcher = (session: {
	site?: { wp_api_url?: string } | null;
	wpCredentials?: { id?: number | string } | null;
	store?: { id?: number | string } | null;
}) => Promise<void>;

let engineScopeSwitcher: EngineScopeSwitcher | null = null;

export function registerEngineScopeSwitcher(switcher: EngineScopeSwitcher | null): void {
	engineScopeSwitcher = switcher;
}

export function getEngineScopeSwitcher(): EngineScopeSwitcher | null {
	return engineScopeSwitcher;
}
