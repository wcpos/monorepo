import type { MetaDataEntry } from './ledger';

export function saleProvenanceMeta(input: {
	registerId: string;
	saleCounter: number;
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
		_wcpos_register: input.registerId,
		_wcpos_sale_time: local + suffix,
		_wcpos_sale_tz: input.timeZone || 'UTC',
		_wcpos_sale_counter: String(input.saleCounter),
		_wcpos_app_version: input.appVersion,
		_wcpos_app_build: input.appBuild,
		...(input.sessionId ? { _wcpos_session: input.sessionId } : {}),
	}).map(([key, value]) => ({ key, value }));
}

export function splitPlanMeta(input: {
	kind: 'even' | 'fixed' | 'items';
	ways: number;
	shares: string[];
}): MetaDataEntry {
	const { kind, ways, shares } = input;
	return { key: '_wcpos_split', value: JSON.stringify({ kind, ways, shares }) };
}

/**
 * Replace-by-key merge for facts that describe the sale as it finally completed. The
 * split summary is written before each attempt at the final leg, so a declined attempt
 * followed by a re-divided remainder must overwrite what the first attempt wrote —
 * unlike the completion tuple, which `withSaleProvenance` deliberately never replaces.
 */
export function withMetaReplaced(
	meta: readonly MetaDataEntry[] | null | undefined,
	entries: readonly MetaDataEntry[]
): MetaDataEntry[] {
	if (entries.length === 0) return [...(meta ?? [])];
	const keys = new Set(entries.map(({ key }) => key));
	return [...(meta ?? []).filter(({ key }) => !keys.has(key)), ...entries];
}

export function hasSaleProvenance(meta: readonly MetaDataEntry[] | null | undefined): boolean {
	return !!meta?.some(({ key }) => key === '_wcpos_sale_counter');
}

export function withSaleProvenance(
	meta: readonly MetaDataEntry[] | null | undefined,
	entries: MetaDataEntry[]
): MetaDataEntry[] {
	const result = [...(meta ?? [])];
	for (const entry of entries) if (!result.some(({ key }) => key === entry.key)) result.push(entry);
	return result;
}
