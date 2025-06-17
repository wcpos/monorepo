import { commandScore } from './fuzzy-search';

import type { Option } from '../types';

export function defaultFilter(items: Option[], query: string, threshold = 0.1): Option[] {
	return (
		items
			.map((item) => ({
				item,
				// Use the label as the primary string and the value as an alias
				score: commandScore(item.label, query, [String(item.value)]),
			}))
			// Filter out items with scores below the threshold
			.filter(({ score }) => score > threshold)
			// Sort descending by score
			.sort((a, b) => b.score - a.score)
			.map(({ item }) => item)
	);
}
