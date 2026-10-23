import * as React from 'react';

import { useIsPhone } from '@wcpos/components/lib/device';
import { GUTTER_UNITS } from '@wcpos/components/lib/scale';

/** The ground's gutter as class strings, one per side or use, and in spacing units for px sums. */
export type Ground = {
	readonly p:
		| 'p-gutter'
		| 'p-4'
		| 'pt-gutter pb-gutter pl-gutter pr-0'
		| 'pt-gutter pb-gutter pl-0 pr-gutter';
	readonly px: 'px-gutter' | 'px-4' | 'pl-gutter pr-0' | 'pl-0 pr-gutter';
	readonly pt: 'pt-gutter' | 'pt-4';
	readonly pl: 'pl-gutter' | 'pl-4' | 'pl-0';
	readonly mt: 'mt-gutter' | 'mt-4';
	readonly mx: 'mx-gutter' | 'mx-4' | 'ml-gutter mr-0' | 'ml-0 mr-gutter';
	readonly gap: 'gap-gutter' | 'gap-4';
	/** Takes back the gutter of the row above (a chip row's bottom padding). */
	readonly negMt: '-mt-gutter' | '-mt-4';
	/** The same gutter in spacing units, for code that needs it in px (`units * unit`). */
	readonly units: number;
};

/** The side of a pane that faces another pane across the resize handle. */
export type InnerEdge = 'left' | 'right';

// Whole literals: the class compiler scans the source for them.
const WINDOW: Ground = Object.freeze({
	p: 'p-gutter',
	px: 'px-gutter',
	pt: 'pt-gutter',
	pl: 'pl-gutter',
	mt: 'mt-gutter',
	mx: 'mx-gutter',
	gap: 'gap-gutter',
	negMt: '-mt-gutter',
	units: GUTTER_UNITS,
});

const PHONE: Ground = Object.freeze({
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

/**
 * The ground of a pane with another pane on its right (the POS products column with the cart on
 * the right): the page gutter everywhere but the inner edge, which keeps none. The resize handle
 * is that gutter: a page-gutter-wide column with the grip centred (`@wcpos/components/panels`),
 * so the cart's surface, flush with it, and the products card sit one page gutter apart, the gap
 * the Gutters table gives any two content areas; a full gutter on the pane's side of the handle
 * had put two there (owner, 2026-10-23: "the spacing between the cart and the products panel
 * needs to be smaller, on the left and on the right"; then "0 gutter", with the grip column at
 * the page gutter).
 */
const INNER_RIGHT: Ground = Object.freeze({
	p: 'pt-gutter pb-gutter pl-gutter pr-0',
	px: 'pl-gutter pr-0',
	pt: 'pt-gutter',
	pl: 'pl-gutter',
	mt: 'mt-gutter',
	mx: 'ml-gutter mr-0',
	gap: 'gap-gutter',
	negMt: '-mt-gutter',
	units: GUTTER_UNITS,
});

const INNER_LEFT: Ground = Object.freeze({
	p: 'pt-gutter pb-gutter pl-0 pr-gutter',
	px: 'pl-0 pr-gutter',
	pt: 'pt-gutter',
	pl: 'pl-0',
	mt: 'mt-gutter',
	mx: 'ml-0 mr-gutter',
	gap: 'gap-gutter',
	negMt: '-mt-gutter',
	units: GUTTER_UNITS,
});

const InnerEdgeContext = React.createContext<InnerEdge | null>(null);

/**
 * Marks the edge of a pane that faces another pane across the resize handle, so every surface
 * on its ground keeps no inset there: the handle is the gutter (`INNER_RIGHT`). The POS products
 * column provides it with the cart's side; the phone, whose panes are tabs, has no inner edge
 * and ignores it.
 */
export const GroundInnerEdge = InnerEdgeContext.Provider;

/**
 * The ground's gutter: the page-gutter token inside a window, 16 at the phone's screen edge
 * (owner, 2026-10-22; CODING_STANDARDS § Gutters), none on an edge that faces another pane.
 * The one place those rules are written; a surface reads `useGround().p`, never `phone ? …`.
 */
export function useGround(): Ground {
	const phone = useIsPhone();
	const inner = React.useContext(InnerEdgeContext);
	if (phone) return PHONE;
	if (inner === 'right') return INNER_RIGHT;
	if (inner === 'left') return INNER_LEFT;
	return WINDOW;
}
