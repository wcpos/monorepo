import { adjustLayoutByDelta } from './adjustLayoutByDelta';
import { validatePanelGroupLayout } from './validatePanelGroupLayout';

import type { ResolvedPanelConstraints } from '../Panel';

export type SeparatorAriaValues = {
	valueMin: number | undefined;
	valueMax: number | undefined;
	valueNow: number | undefined;
};

export function calculateAriaValues({
	layout,
	panelConstraints,
	panelIndex,
}: {
	layout: number[];
	panelConstraints: ResolvedPanelConstraints[];
	panelIndex: number;
}): SeparatorAriaValues {
	const panelSize = layout[panelIndex];
	const constraints = panelConstraints[panelIndex];
	if (panelSize == null || constraints == null) {
		return { valueMin: undefined, valueMax: undefined, valueNow: panelSize };
	}

	const pivotIndices = [panelIndex, panelIndex + 1];
	const resizeTo = (size: number) =>
		validatePanelGroupLayout({
			layout: adjustLayoutByDelta({
				delta: size - panelSize,
				initialLayout: layout,
				panelConstraints,
				pivotIndices,
				prevLayout: layout,
				trigger: 'keyboard',
			}),
			panelConstraints,
		})[panelIndex];

	return {
		valueMin: resizeTo(
			constraints.collapsible ? (constraints.collapsedSize ?? 0) : (constraints.minSize ?? 0)
		),
		valueMax: resizeTo(constraints.maxSize ?? 100),
		valueNow: panelSize,
	};
}
