import type { MetaDataEntry } from './ledger';

/**
 * The completion tuple. A sale on a till with no register bound (or one bound in another
 * store) still stamps what is known — when, where, which build, which session — and omits
 * the register and the counter rather than inventing them: the counter is the numbered
 * sequence a register report is reconciled against, and a sale outside it must not
 * claim a place in it.
 */
export function saleProvenanceMeta(input: {
	registerId: string | null;
	saleCounter: number | null;
	now: Date;
	timeZone: string;
	appVersion: string;
	appBuild: string;
	sessionId?: string | null;
}): MetaDataEntry[] {
	const offset = -input.now.getTimezoneOffset();
	const pad = (value: number) => String(value).padStart(2, '0');
	const local = new Date(input.now.getTime() + offset * 60_000).toISOString().slice(0, 19);
	const suffix = `${offset < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
	return Object.entries({
		...(input.registerId ? { _wcpos_register: input.registerId } : {}),
		_wcpos_sale_time: local + suffix,
		_wcpos_sale_tz: input.timeZone || 'UTC',
		...(input.saleCounter !== null ? { _wcpos_sale_counter: String(input.saleCounter) } : {}),
		_wcpos_app_version: input.appVersion,
		_wcpos_app_build: input.appBuild,
		...(input.sessionId ? { _wcpos_session: input.sessionId } : {}),
	}).map(([key, value]) => ({ key, value }));
}

export const SPLIT_META_KEY = '_wcpos_split';

export function splitPlanMeta(input: {
	kind: 'even' | 'fixed' | 'items';
	ways: number;
	shares: string[];
}): MetaDataEntry {
	const { kind, ways, shares } = input;
	return { key: SPLIT_META_KEY, value: JSON.stringify({ kind, ways, shares }) };
}

/**
 * Replace-by-key merge for facts that describe the sale as it finally completed. The
 * split summary is written before each attempt at the final leg, so a declined attempt
 * followed by a re-divided remainder must overwrite what the first attempt wrote —
 * unlike the completion tuple, which `withSaleProvenance` deliberately never replaces.
 *
 * An entry already on the order is updated in place so it keeps the id Woo assigned
 * it: an id-less element on the wire is an append, and a replaced-by-removal entry
 * would leave the stale one on the server next to the new one.
 *
 * An entry whose `value` is `null` means "remove": one that has an id is kept with the
 * null value, which is how Woo is told to delete it on the next push; one that was never
 * synced is simply dropped. Readers treat a null value as absent.
 */
export function withMetaReplaced(
	meta: readonly MetaDataEntry[] | null | undefined,
	entries: readonly MetaDataEntry[]
): MetaDataEntry[] {
	const result = (meta ?? []).map((entry) => ({ ...entry }));
	for (const entry of entries) {
		const index = result.findIndex(({ key }) => key === entry.key);
		if (entry.value === null) {
			if (index === -1) continue;
			if (result[index].id === undefined) result.splice(index, 1);
			else result[index] = { ...result[index], value: null };
		} else if (index === -1) result.push({ ...entry });
		else result[index] = { ...result[index], value: entry.value };
	}
	return result;
}

/** Fully stamped: the sale has its place in the register's numbered sequence. */
export function hasSaleProvenance(meta: readonly MetaDataEntry[] | null | undefined): boolean {
	return !!meta?.some(({ key }) => key === '_wcpos_sale_counter');
}

/** Stamped at all, including the partial tuple a sale with no register gets. */
export function hasSaleTime(meta: readonly MetaDataEntry[] | null | undefined): boolean {
	return !!meta?.some(({ key }) => key === '_wcpos_sale_time');
}

export function withSaleProvenance(
	meta: readonly MetaDataEntry[] | null | undefined,
	entries: MetaDataEntry[]
): MetaDataEntry[] {
	const result = [...(meta ?? [])];
	for (const entry of entries) if (!result.some(({ key }) => key === entry.key)) result.push(entry);
	return result;
}
