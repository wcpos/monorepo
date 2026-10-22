/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useGround } from './ground';

let mockPhone = false;
jest.mock('@wcpos/components/lib/device', () => ({ useIsPhone: () => mockPhone }));

beforeEach(() => {
	mockPhone = false;
});

// The phone's screen edge keeps 16; the ground inside a window takes the page-gutter token.
it('gives the page-gutter token inside a window', () => {
	expect(renderHook(() => useGround()).result.current).toEqual({
		p: 'p-gutter',
		px: 'px-gutter',
		pt: 'pt-gutter',
		pl: 'pl-gutter',
		mt: 'mt-gutter',
		mx: 'mx-gutter',
		gap: 'gap-gutter',
		negMt: '-mt-gutter',
		units: 3,
	});
});

it('keeps 16 at the phone screen edge', () => {
	mockPhone = true;
	expect(renderHook(() => useGround()).result.current).toEqual({
		p: 'p-4',
		px: 'px-4',
		pt: 'pt-4',
		pl: 'pl-4',
		mt: 'mt-4',
		mx: 'mx-4',
		gap: 'gap-4',
		negMt: '-mt-4',
		units: 4,
	});
});

it('hands out the same frozen object every render', () => {
	const { result, rerender } = renderHook(() => useGround());
	const first = result.current;
	rerender();
	expect(result.current).toBe(first);
	expect(Object.isFrozen(first)).toBe(true);
});
