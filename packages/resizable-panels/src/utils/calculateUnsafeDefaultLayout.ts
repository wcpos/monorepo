import { assert } from './assert';

import type { PanelData, ResolvedPanelConstraints } from '../Panel';

export function calculateUnsafeDefaultLayout({
	panelDataArray,
}: {
	panelDataArray: (Omit<PanelData, 'constraints'> & {
		constraints: ResolvedPanelConstraints;
	})[];
}): number[] {
	const layout = Array<number>(panelDataArray.length);

	const panelConstraintsArray = panelDataArray.map((panelData) => panelData.constraints);

	let numPanelsWithSizes = 0;
	let remainingSize = 100;

	// Distribute default sizes first
	for (let index = 0; index < panelDataArray.length; index++) {
		const panelConstraints = panelConstraintsArray[index];
		assert(panelConstraints, `Panel constraints not found for index ${index}`);
		const { defaultSize } = panelConstraints;

		if (defaultSize != null) {
			numPanelsWithSizes++;
			layout[index] = defaultSize;
			remainingSize -= defaultSize;
		}
	}

	// Calculate the size for remaining panels once, before the loop.
	const numRemainingPanels = panelDataArray.length - numPanelsWithSizes;
	const sizePerRemainingPanel = numRemainingPanels > 0 ? remainingSize / numRemainingPanels : 0;

	// Distribute the remaining size evenly.
	for (let index = 0; index < panelDataArray.length; index++) {
		const panelConstraints = panelConstraintsArray[index];
		assert(panelConstraints, `Panel constraints not found for index ${index}`);
		const { defaultSize } = panelConstraints;

		if (defaultSize != null) {
			continue;
		}

		layout[index] = sizePerRemainingPanel;
	}

	return layout;
}
