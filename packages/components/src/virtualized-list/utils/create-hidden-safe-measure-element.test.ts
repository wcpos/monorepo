/**
 * @jest-environment jsdom
 */
import { measureElement as defaultMeasureElement } from '@tanstack/react-virtual';

import { createHiddenSafeMeasureElement } from './create-hidden-safe-measure-element';

import type { Virtualizer } from '@tanstack/virtual-core';

jest.mock('@tanstack/react-virtual', () => ({
	measureElement: jest.fn(() => 73),
}));

function createVirtualizer(cachedSize?: number) {
	return {
		indexFromElement: jest.fn(() => 0),
		measurementsCache: cachedSize === undefined ? [] : [{ size: cachedSize }],
	} as unknown as Virtualizer<HTMLDivElement, Element>;
}

describe('createHiddenSafeMeasureElement', () => {
	it('returns the cached size for a hidden element', () => {
		const element = document.createElement('div');
		const virtualizer = createVirtualizer(48);

		const size = createHiddenSafeMeasureElement(32)(element, undefined, virtualizer);

		expect(size).toBe(48);
		expect(defaultMeasureElement).not.toHaveBeenCalled();
	});

	it('returns the estimated size for a hidden element without a cached measurement', () => {
		const element = document.createElement('div');
		const virtualizer = createVirtualizer();

		const size = createHiddenSafeMeasureElement(32)(element, undefined, virtualizer);

		expect(size).toBe(32);
		expect(defaultMeasureElement).not.toHaveBeenCalled();
	});

	it('delegates visible elements to the default measurer', () => {
		const element = document.createElement('div');
		Object.defineProperty(element, 'offsetParent', { value: document.body });
		const virtualizer = createVirtualizer(48);

		const size = createHiddenSafeMeasureElement(32)(element, undefined, virtualizer);

		expect(size).toBe(73);
		expect(defaultMeasureElement).toHaveBeenCalledWith(element, undefined, virtualizer);
	});
});
