import { Directory } from 'expo-file-system';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
const canonical = (v: unknown): unknown =>
	Array.isArray(v)
		? v.map(canonical)
		: v && typeof v === 'object'
			? Object.fromEntries(
					Object.keys(v)
						.filter((k) => k !== '_rev')
						.sort()
						.map((k) => [k, canonical((v as Record<string, unknown>)[k])])
				)
			: v;
export const signature = (value: unknown) =>
	digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(canonical(value)));
export const sorted = <T extends { uuid?: string; id?: string }>(docs: T[]) =>
	[...docs].sort((a, b) => (a.uuid ?? a.id)!.localeCompare((b.uuid ?? b.id)!));
export function diskBytes(dir: Directory): { bytes: number; files: number } {
	let bytes = 0,
		files = 0;
	for (const entry of dir.list()) {
		if (entry instanceof Directory) {
			const sub = diskBytes(entry);
			bytes += sub.bytes;
			files += sub.files;
		} else {
			bytes += entry.size;
			files++;
		}
	}
	return { bytes, files };
}
export function heap() {
	const hermes = (
		globalThis as unknown as {
			HermesInternal?: { getInstrumentedStats?: () => Record<string, number> };
		}
	).HermesInternal;
	const raw = hermes?.getInstrumentedStats?.();
	return {
		js_heapSize: raw?.js_heapSize ?? null,
		js_allocatedBytes: raw?.js_allocatedBytes ?? null,
		gcCount: raw?.js_numGCs ?? raw?.gc_count ?? null,
		raw: raw ?? null,
	};
}
