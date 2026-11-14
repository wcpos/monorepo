/** @jest-environment jsdom */
import * as React from 'react';

import { renderHook } from '@testing-library/react';

import { GroundInnerEdge, useGround } from './ground';

let mockPhone = false;
jest.mock('./device', () => ({ useIsPhone: () => mockPhone }));

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
		tiles: 'px-gutter',
		tileRow: '',
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
		tiles: 'px-4',
		tileRow: '',
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

// A pane with another pane across the resize handle keeps no inset on that edge: the handle is
// the gutter, one page gutter wide (CODING_STANDARDS § Gutters). On a right inner edge the tile
// ground keeps the tile's own margin, so the scroller ends at the pane's edge, and the row keeps
// the 2 px a Poster stack reaches past that margin: the scroller clips its sides, and with no
// room inside it the last column's stacks were cut off.
it.each([
	[
		'right',
		'pl-gutter pr-0',
		'ml-gutter mr-0',
		'pt-gutter pb-gutter pl-gutter pr-0',
		'pl-gutter',
		'pl-gutter pr-1',
		'pr-0.5',
	],
	[
		'left',
		'pl-0 pr-gutter',
		'ml-0 mr-gutter',
		'pt-gutter pb-gutter pl-0 pr-gutter',
		'pl-0',
		'pl-0 pr-gutter',
		'',
	],
] as const)('keeps no inset on the inner edge (%s)', (edge, px, mx, p, pl, tiles, tileRow) => {
	const wrapper = ({ children }: React.PropsWithChildren) =>
		React.createElement(GroundInnerEdge, { value: edge }, children);
	expect(renderHook(() => useGround(), { wrapper }).result.current).toMatchObject({
		px,
		mx,
		p,
		pl,
		tiles,
		tileRow,
		pt: 'pt-gutter',
		gap: 'gap-gutter',
		negMt: '-mt-gutter',
		units: 3,
	});
});

it('ignores the inner edge on a phone, whose panes are tabs', () => {
	mockPhone = true;
	const wrapper = ({ children }: React.PropsWithChildren) =>
		React.createElement(GroundInnerEdge, { value: 'right' }, children);
	expect(renderHook(() => useGround(), { wrapper }).result.current.px).toBe('px-4');
});
