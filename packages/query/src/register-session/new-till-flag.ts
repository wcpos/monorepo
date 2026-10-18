/**
 * "Become a new till on the next load."
 *
 * The register document (the till id and its per-site sale counters) lives in the
 * user database, so copying that database clones the till: every copy then stamps
 * the same till id and the same counter run on its sales, and Store health reports
 * the duplicates. The web E2E suite does exactly that — one login is snapshotted and
 * restored into every test — so it arms this flag beside the restored snapshot and
 * hydration re-mints the till before the first sale (`remintRegister`).
 *
 * Web only, like the clear-local-data flag: native installs cannot be cloned this way
 * and have no localStorage, so the read is a no-op there.
 */
export const NEW_TILL_ON_NEXT_LOAD_KEY = 'wcpos.newTillOnNextLoad';

/** Read-and-clear: true exactly once per armed load. */
export function consumeNewTillOnNextLoad(): boolean {
	try {
		const storage = (globalThis as { localStorage?: Storage }).localStorage;
		if (!storage || storage.getItem(NEW_TILL_ON_NEXT_LOAD_KEY) !== '1') return false;
		storage.removeItem(NEW_TILL_ON_NEXT_LOAD_KEY);
		return true;
	} catch {
		return false;
	}
}
