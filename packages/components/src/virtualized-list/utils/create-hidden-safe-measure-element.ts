import { measureElement as defaultMeasureElement } from '@tanstack/react-virtual';

export function createHiddenSafeMeasureElement(
	estimatedItemSize: number
): typeof defaultMeasureElement {
	return (element, entry, instance) => {
		if ((element as unknown as HTMLElement).offsetParent === null) {
			return (
				instance.measurementsCache[instance.indexFromElement(element)]?.size ?? estimatedItemSize
			);
		}

		return defaultMeasureElement(element, entry, instance);
	};
}
