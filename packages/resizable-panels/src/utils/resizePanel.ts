import { PRECISION } from '../constants';
import { assert } from './assert';
import { fuzzyCompareNumbers } from './numbers/fuzzyCompareNumbers';

import type { ResolvedPanelConstraints } from '../Panel';

// Panel size must be in percentages; pixel values should be pre-converted
export function resizePanel({
	panelConstraints: panelConstraintsArray,
	panelIndex,
	size,
	prevSize = size,
	overrideDisabledPanels = true,
}: {
	panelConstraints: ResolvedPanelConstraints[];
	panelIndex: number;
	prevSize?: number;
	size: number;
	overrideDisabledPanels?: boolean;
}) {
	const panelConstraints = panelConstraintsArray[panelIndex];
	assert(panelConstraints != null, `Panel constraints not found for index ${panelIndex}`);

	let { collapsedSize = 0, collapsible, disabled, maxSize = 100, minSize = 0 } = panelConstraints;

	if (disabled && !overrideDisabledPanels) return prevSize;

	if (fuzzyCompareNumbers(size, minSize) < 0) {
		if (collapsible) {
			// Collapsible panels should snap closed or open only once they cross the halfway point between collapsed and min size.
			const halfwayPoint = (collapsedSize + minSize) / 2;
			if (fuzzyCompareNumbers(size, halfwayPoint) < 0) {
				size = collapsedSize;
			} else {
				size = minSize;
			}
		} else {
			size = minSize;
		}
	}

	size = Math.min(maxSize, size);
	size = parseFloat(size.toFixed(PRECISION));

	return size;
}
