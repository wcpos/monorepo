export type Transaction = { tx: number; n: number; ids: string[] };
export type Snapshot = { acked: Transaction[]; inflight: Transaction | null };
export const SEED_COUNT = 2000; // 2210's untimed baseline, always included in ownership replay.
export const seedIds = Array.from({ length: SEED_COUNT }, (_, i) => `s${i}`);
export function score(snapshot: Snapshot, docs: { id: string; tx: number }[]) {
	const actual = new Map(docs.map((d) => [d.id, d.tx])),
		expected = new Map();
	const acked = [{ tx: 0, ids: seedIds }, ...snapshot.acked];
	for (const { tx, ids } of acked) for (const id of ids) expected.set(id, tx);
	const inflight = snapshot.inflight,
		inflightIds = new Set(inflight?.ids ?? []);
	const presentCount = inflight
		? docs.filter((d) => d.tx === inflight.tx && inflightIds.has(d.id)).length
		: 0;
	const inflightPresence = !inflight
		? 'none'
		: presentCount === 0
			? 'absent'
			: presentCount === inflight.n
				? 'present'
				: 'partial';
	// Later acknowledged owners supersede earlier ones. Only actual in-flight replacements excuse
	// an old owner's absence; a partly written in-flight batch must not hide an unrelated lost ack.
	const missing = [...expected].filter(
		([id, tx]) => actual.get(id) !== tx && !(inflightIds.has(id) && actual.get(id) === inflight?.tx)
	);
	if (missing.length)
		return {
			outcome: 'lost',
			inflightPresence,
			missing: missing.slice(0, 20),
			missingCount: missing.length,
		};
	if (inflight && inflightPresence === 'present')
		for (const id of inflight.ids) expected.set(id, inflight.tx);
	const partial =
		inflightPresence === 'partial' ||
		actual.size !== expected.size ||
		[...actual].some(([id, tx]) => expected.get(id) !== tx);
	return { outcome: partial ? 'partial' : 'ok', inflightPresence };
}
