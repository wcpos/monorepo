import { renderHook } from '@testing-library/react';

import { useSpacingUnit } from './use-spacing-unit';

let mockSpacing: unknown;
jest.mock('uniwind', () => ({ useCSSVariable: () => mockSpacing }));

const read = (value: unknown) => {
	mockSpacing = value;
	return renderHook(() => useSpacingUnit()).result.current;
};

describe('useSpacingUnit', () => {
	it("parses web's computed string, the provider's `${n}px`", () => {
		expect(read('5px')).toBe(5);
		expect(read('3.5px')).toBe(3.5);
		expect(read(' 4px')).toBe(4);
	});

	it("takes native's number as it is", () => {
		expect(read(5)).toBe(5);
		expect(read(3.5)).toBe(3.5);
	});

	it("falls back to Regular's 4 when there is no usable step", () => {
		for (const value of [undefined, '', 'auto', '0px', 0, -4, Number.NaN]) {
			expect(read(value)).toBe(4);
		}
	});
});
