import type { DiscoveredPrinter } from '../types';

/** Merge discovered printers into the existing list without duplicating ids. */
export function mergePrinters(
	existing: DiscoveredPrinter[],
	discovered: DiscoveredPrinter[]
): DiscoveredPrinter[] {
	const ids = new Set(existing.map((printer) => printer.id));
	const merged = [...existing];
	for (const printer of discovered) {
		if (!ids.has(printer.id)) {
			merged.push(printer);
			ids.add(printer.id);
		}
	}
	return merged;
}
