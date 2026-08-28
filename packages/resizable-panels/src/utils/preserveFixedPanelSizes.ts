import { PRECISION } from '../constants';

import type { ResolvedPanelConstraints } from '../Panel';

function formatSize(size: number) {
	return Number(size.toFixed(PRECISION));
}

export function preserveFixedPanelSizes({
	nextGroupSize,
	panelConstraints,
	prevGroupSize,
	prevLayout,
}: {
	nextGroupSize: number;
	panelConstraints: ResolvedPanelConstraints[];
	prevGroupSize: number;
	prevLayout: number[];
}): number[] {
	if (prevGroupSize <= 0 || nextGroupSize <= 0 || prevGroupSize === nextGroupSize) {
		return prevLayout;
	}

	let fixedPanelsTotalSize = 0;
	let flexiblePanelsTotalPrevSize = 0;
	const nextLayout = [...prevLayout];
	const flexiblePanelIndices: number[] = [];

	panelConstraints.forEach((constraints, index) => {
		const prevPanelSize = prevLayout[index] ?? 0;
		if (constraints.groupResizeBehavior === 'preserve-pixel-size') {
			const nextPanelSize = formatSize(
				(((prevPanelSize / 100) * prevGroupSize) / nextGroupSize) * 100
			);
			nextLayout[index] = nextPanelSize;
			fixedPanelsTotalSize += nextPanelSize;
		} else {
			flexiblePanelIndices.push(index);
			flexiblePanelsTotalPrevSize += prevPanelSize;
		}
	});

	if (
		flexiblePanelIndices.length === 0 ||
		flexiblePanelIndices.length === panelConstraints.length
	) {
		return prevLayout;
	}

	const remainingSize = 100 - fixedPanelsTotalSize;
	for (const index of flexiblePanelIndices) {
		const prevSize = prevLayout[index] ?? 0;
		nextLayout[index] = formatSize(
			flexiblePanelsTotalPrevSize > 0
				? (prevSize / flexiblePanelsTotalPrevSize) * remainingSize
				: remainingSize / flexiblePanelIndices.length
		);
	}

	return nextLayout;
}
