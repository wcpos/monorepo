/** @jest-environment jsdom */
import * as React from 'react';
import type { ViewProps } from 'react-native';

import { render, renderHook, screen } from '@testing-library/react';

import { type Edge, EdgeSurface, TitleBarStripProvider, useEdgeInsets } from './index';

jest.mock('react-native', () => {
	const native = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...native,
		View: ({ testID, style, children }: ViewProps) => (
			<div data-testid={testID} style={native.StyleSheet.flatten(style) as React.CSSProperties}>
				{children}
			</div>
		),
	};
});

// A notched phone in portrait: the status bar, the home indicator, no side insets.
let mockInsets = { top: 47, right: 0, bottom: 34, left: 0 };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => mockInsets }));
beforeEach(() => {
	mockInsets = { top: 47, right: 0, bottom: 34, left: 0 };
});

const padding = (testID: string) => {
	const { paddingTop, paddingRight, paddingBottom, paddingLeft } = screen.getByTestId(testID).style;
	return { paddingTop, paddingRight, paddingBottom, paddingLeft };
};

// Edges in, padding out: each edge a surface touches is padded by that edge's inset, inside the
// surface's own background; an edge it does not touch keeps whatever its classes give it.
it.each<[readonly Edge[], Record<string, string>]>([
	[['top'], { paddingTop: '47px', paddingRight: '', paddingBottom: '', paddingLeft: '' }],
	[['bottom'], { paddingTop: '', paddingRight: '', paddingBottom: '34px', paddingLeft: '' }],
	[
		['top', 'bottom'],
		{ paddingTop: '47px', paddingRight: '', paddingBottom: '34px', paddingLeft: '' },
	],
	[[], { paddingTop: '', paddingRight: '', paddingBottom: '', paddingLeft: '' }],
])('pads the edges it touches (%j)', (edges, expected) => {
	render(<EdgeSurface testID="surface" edges={edges} />);
	expect(padding('surface')).toEqual(expected);
});

// Web and the desktop report no system bars: the surface's own class padding stands.
it('writes no padding for an edge with no inset', () => {
	mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
	expect(renderHook(() => useEdgeInsets(['top', 'bottom'])).result.current).toEqual({});
});

// The POS top inset is padded once: the register column pads it, and the products bar inside
// the column, which pads the top inset on any other page, reads nothing left to pad.
it('pads an edge once: nothing inside a surface pads its edges again', () => {
	render(
		<EdgeSurface testID="column" edges={['top', 'bottom']}>
			<EdgeSurface testID="bar" edges={['top']} />
			<EdgeSurface testID="page" edges={['bottom']} />
		</EdgeSurface>
	);
	expect(padding('column')).toMatchObject({ paddingTop: '47px', paddingBottom: '34px' });
	expect(padding('bar').paddingTop).toBe('');
	expect(padding('page').paddingBottom).toBe('');
});

// A surface takes only the edges it touches: a column padding the status bar leaves the home
// indicator to the row that sits on it (the phone till's tab bar, a page's scroll content).
it('leaves the edges it does not touch to what is inside it', () => {
	const wrapper = ({ children }: React.PropsWithChildren) => (
		<EdgeSurface edges={['top']}>{children}</EdgeSurface>
	);
	expect(renderHook(() => useEdgeInsets(['top', 'bottom']), { wrapper }).result.current).toEqual({
		paddingBottom: 34,
	});
});

// The desktop's title-bar strip is part of the top edge, padded once: by the first surface on the
// top edge (a page bar, the rail), or by a ground that takes the strip alone (the POS root), whose
// columns then pad only the status bar.
it('pads the title-bar strip once, with the top edge or on its own', () => {
	render(
		<TitleBarStripProvider value={{ node: null, height: 28 }}>
			<EdgeSurface testID="bar" edges={['top']}>
				<EdgeSurface testID="inner" edges={['top']} />
			</EdgeSurface>
			<EdgeSurface testID="pos" edges={['strip']}>
				<EdgeSurface testID="column" edges={['top']} />
			</EdgeSurface>
		</TitleBarStripProvider>
	);
	expect(padding('bar').paddingTop).toBe('75px');
	expect(padding('inner').paddingTop).toBe('');
	expect(padding('pos').paddingTop).toBe('28px');
	expect(padding('column').paddingTop).toBe('47px');
});
