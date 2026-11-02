import * as React from 'react';
import { View, type ViewInstance, type ViewProps } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTitleBarStrip } from './title-bar-strip';

export { TitleBarStripPortal } from './title-bar-strip-portal';
export { TitleBarStripProvider, useTitleBarStrip, type TitleBarStripHost } from './title-bar-strip';

/**
 * A screen edge a surface can touch. `top` is the whole top edge: the status bar, and on the
 * desktop the title-bar strip under the OS window controls. `strip` is the strip alone, for a
 * ground that spans the window under the controls while its columns pad the status bar (the POS).
 */
export type Edge = 'top' | 'right' | 'bottom' | 'left' | 'strip';

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
	strip: 'paddingTop',
} as const satisfies Record<Edge, keyof EdgePadding>;

/** The edges a surface above has padded: nothing inside it pads them again. */
const PaddedEdges = React.createContext<readonly Edge[]>([]);

/**
 * The safe-area padding owed on `edges`: each edge's inset, unless an `EdgeSurface` above has
 * padded it. An edge with no inset (web, the desktop, a phone without a home indicator) gets no
 * key, so a surface's own class padding there stands. For a surface a View cannot wrap: a scroll
 * view's content, which scrolls under the home indicator and stops its last row above it, or the
 * drawer's panel, or a native modal that is a screen's root view (the overlay shell).
 */
export function useEdgeInsets(edges: readonly Edge[]): EdgePadding {
	const insets = useSafeAreaInsets();
	const { height: strip } = useTitleBarStrip();
	const padded = React.useContext(PaddedEdges);
	// The strip is part of the top edge, and padded once: by the first surface on the top edge, or
	// by a ground that takes the strip alone.
	const owed = (edge: Edge): number => {
		if (padded.includes(edge)) return 0;
		if (edge === 'strip') return strip;
		return (insets[edge] ?? 0) + (edge === 'top' ? owed('strip') : 0);
	};
	const style: EdgePadding = {};
	for (const edge of edges) {
		const inset = owed(edge);
		if (inset > 0) style[PADDING[edge]] = inset;
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
}: ViewProps & { edges: readonly Edge[]; ref?: React.Ref<ViewInstance> }) {
	const above = React.useContext(PaddedEdges);
	const padding = useEdgeInsets(edges);
	// A string key, so the context value changes only when the set of edges does.
	const taken = edges.flatMap((edge) => (edge === 'top' ? ['top', 'strip'] : [edge]));
	const key = [...new Set([...above, ...taken])].sort().join(' ');
	const padded = React.useMemo(() => (key ? (key.split(' ') as Edge[]) : []), [key]);
	return (
		<View style={style ? [style, padding] : padding} {...props}>
			<PaddedEdges.Provider value={padded}>{children}</PaddedEdges.Provider>
		</View>
	);
}
