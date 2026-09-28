export type LineSort = 'newest_bottom' | 'newest_top' | 'name' | 'price';

type SortableLine = {
	position: number;
	kind: 'line' | 'fee' | 'shipping';
	name: string;
	total: number;
};
const group = { line: 0, fee: 1, shipping: 2 };

export function sortLines<T extends SortableLine>(lines: readonly T[], setting: LineSort): T[] {
	return [...lines].sort((a, b) => {
		const grouping = group[a.kind] - group[b.kind];
		if (grouping) return grouping;
		if (a.kind !== 'line') return a.position - b.position;
		if (setting === 'newest_top') return b.position - a.position;
		if (setting === 'name') return a.name.localeCompare(b.name) || a.position - b.position;
		if (setting === 'price') return a.total - b.total || a.position - b.position;
		return a.position - b.position;
	});
}
