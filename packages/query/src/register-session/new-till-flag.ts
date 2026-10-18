/**
 * "Become a new till on the next load."
 *
 * The register document (the till id and its per-site sale counters) lives in the
 * user database, so copying that database clones the till: every copy then stamps
 * the same till id and the same counter run on its sales, and Store health reports
 * the duplicates. The web E2E suite does exactly that — one login is snapshotted and
 * restored into every test — so it arms this flag beside the restored snapshot and
 * hydration re-mints the till before the first sale (`remintRegister`), then disarms
 * it. Disarming only after the re-mint means a failed re-mint is retried on the next
 * load instead of leaving the clone armed with nothing.
 *
 * Web only, like the clear-local-data flag: native installs cannot be cloned this way
 * and have no localStorage, so the read is a no-op there.
 */
export const NEW_TILL_ON_NEXT_LOAD_KEY = 'wcpos.newTillOnNextLoad';

function storage(): Storage | undefined {
	return (globalThis as { localStorage?: Storage }).localStorage;
}

export function newTillOnNextLoadArmed(): boolean {
	try {
		return storage()?.getItem(NEW_TILL_ON_NEXT_LOAD_KEY) === '1';
	} catch {
		return false;
	}
}

export function disarmNewTillOnNextLoad(): void {
	try {
		storage()?.removeItem(NEW_TILL_ON_NEXT_LOAD_KEY);
	} catch {
		// An armed flag that cannot be cleared re-mints again on the next load, which
		// costs a till id and nothing else.
	}
}
