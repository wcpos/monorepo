/** @jest-environment jsdom */
import * as React from 'react';
import type { ViewProps } from 'react-native';

import { render, screen } from '@testing-library/react';

import { ChipRow } from '@wcpos/components/chip-row';
import { DeviceScope } from '@wcpos/components/lib/device';
import { GroundInnerEdge, type InnerEdge } from '@wcpos/components/lib/ground';
import { PageBar } from '@wcpos/components/page-bar';

import { TableSurface } from './surface';

jest.mock('react-native', () => {
	const native = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...native,
		// RN-web drops className without the Uniwind transform; keep it at this boundary.
		View: ({ testID, className, children }: ViewProps) => (
			<div data-testid={testID} className={className}>
				{children}
			</div>
		),
		ScrollView: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	};
});
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));

/** The three list surfaces on one ground: the bar's control row, the chip row, the table card. */
function Surfaces({ phone, edge }: { phone: boolean; edge: InnerEdge | null }) {
	const surfaces = (
		<>
			<PageBar testID="bar" />
			<ChipRow testID="chips">{null}</ChipRow>
			<TableSurface testID="table" />
		</>
	);
	return (
		<DeviceScope phone={phone}>
			{edge ? <GroundInnerEdge value={edge}>{surfaces}</GroundInnerEdge> : surfaces}
		</DeviceScope>
	);
}

/** The horizontal gutter classes a surface carries. */
const sides = (node: Element | null) =>
	(node?.getAttribute('class') ?? '').split(' ').filter((name) => /^-?(p|m)(x|l|r)-/.test(name));

// One gutter table, read by every surface on the ground (CODING_STANDARDS § Gutters): the bar,
// the chips and the card share their sides, and a pane's edge that faces another pane across the
// resize handle keeps none on all three (the POS products column beside the cart).
it.each<[string, InnerEdge | null, string[], string[]]>([
	['a window', null, ['px-gutter'], ['mx-gutter']],
	['the cart on the right', 'right', ['pl-gutter', 'pr-0'], ['ml-gutter', 'mr-0']],
	['the cart on the left', 'left', ['pl-0', 'pr-gutter'], ['ml-0', 'mr-gutter']],
])(
	'resolves the same sides on the bar, the chips and the card (%s)',
	(_, edge, padding, margin) => {
		render(<Surfaces phone={false} edge={edge} />);
		expect(sides(screen.getByTestId('bar').firstElementChild)).toEqual(padding);
		expect(screen.getByTestId('chips').getAttribute('class')?.split(' ')).toEqual(
			edge ? expect.arrayContaining(padding) : ['p-gutter']
		);
		expect(sides(screen.getByTestId('table'))).toEqual(margin);
	}
);

// The phone has no inner edge (its panes are tabs): the chips keep the screen edge's 16.
it('ignores the inner edge on a phone', () => {
	render(<Surfaces phone edge="right" />);
	expect(screen.getByTestId('chips').getAttribute('class')).toBe('p-4');
	expect(sides(screen.getByTestId('table'))).toEqual([]);
});
