import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** A screen edge a surface can touch. */
export type Edge = 'top' | 'right' | 'bottom' | 'left';

/** The padding owed to the screen edges a surface touches; an edge with no inset has no key. */
export type EdgePadding = {
	paddingTop?: number;
	paddingRight?: number;
	paddingBottom?: number;
	paddingLeft?: number;
};

const PADDING = {
	top: 'paddingTop',
	right: 'paddingRight',
	bottom: 'paddingBottom',
	left: 'paddingLeft',
} as const satisfies Record<Edge, keyof EdgePadding>;

/** The edges a surface above has padded: nothing inside it pads them again. */
const PaddedEdges = React.createContext<readonly Edge[]>([]);

/**
 * The safe-area padding owed on `edges`: each edge's inset, unless an `EdgeSurface` above has
 * padded it. An edge with no inset (web, the desktop, a phone without a home indicator) gets no
 * key, so a surface's own class padding there stands. For a surface a View cannot wrap: a scroll
 * view's content, which scrolls under the home indicator and stops its last row above it, or the
 * drawer's panel. The overlays read the window's insets, not this: a sheet opened from inside a
 * surface still sits on the screen's edges.
 */
export function useEdgeInsets(edges: readonly Edge[]): EdgePadding {
	const insets = useSafeAreaInsets();
	const padded = React.useContext(PaddedEdges);
	const style: EdgePadding = {};
	for (const edge of edges) {
		const inset = insets[edge] ?? 0;
		if (inset > 0 && !padded.includes(edge)) style[PADDING[edge]] = inset;
	}
	return style;
}

/**
 * A surface that touches the screen's `edges`. Apple's layout rule: backgrounds run edge to edge,
 * and only content and controls stay inside the safe area. So the surface paints its background
 * (`className`) through the status bar and the home indicator and pads each edge's inset INSIDE
 * it; the system bars then float over the surface they sit on. Everything inside reads those
 * edges as padded, so an inset is padded once however deep the surfaces nest: the register
 * column pads the status bar and its page bar, which pads it on any other page, does not.
 *
 * The bug this rule fixed (owner, iPad landscape, 2026-10-14): the POS root painted
 * `bg-background` and padded both insets for the whole stack, so the white cart column, the grey
 * products column and the divider between them stopped a bar's height short of both edges,
 * under a flat grey band across the full width.
 */
export function EdgeSurface({
	edges,
	style,
	children,
	...props
}: ViewProps & { edges: readonly Edge[] }) {
	const above = React.useContext(PaddedEdges);
	const padding = useEdgeInsets(edges);
	// A string key, so the context value changes only when the set of edges does.
	const key = [...new Set([...above, ...edges])].sort().join(' ');
	const padded = React.useMemo(() => (key ? (key.split(' ') as Edge[]) : []), [key]);
	return (
		<View style={style ? [style, padding] : padding} {...props}>
			<PaddedEdges.Provider value={padded}>{children}</PaddedEdges.Provider>
		</View>
	);
}
