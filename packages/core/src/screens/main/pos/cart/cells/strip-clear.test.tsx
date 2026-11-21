/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { ShippingTitle } from './shipping-title';
import { StripEdgeContext } from './strip-clear';

let mockBox: { style?: { paddingRight?: number }; onLayout?: (event: unknown) => void };

jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		View: (props: React.ComponentProps<typeof actual.View>) => {
			if (props.onLayout) mockBox = props;
			return <actual.View {...props} />;
		},
	};
});
jest.mock('@wcpos/components/editable-field', () => ({
	EditableField: ({ numberOfLines }: { numberOfLines: number }) => (
		<span data-testid="name" data-lines={numberOfLines} />
	),
}));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('../../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: jest.fn() }),
}));

const props = {
	row: { original: { uuid: 'ship-1', type: 'line_items', item: { method_title: 'Flat rate' } } },
} as unknown as React.ComponentProps<typeof ShippingTitle>;

/** The name's box as the browser lays it out: its right edge, and a text of `lines` 20 px lines. */
function laidOut(right: number, lines: number) {
	const box = document.createElement('div');
	const text = box.appendChild(document.createElement('div'));
	text.setAttribute('dir', 'auto');
	text.style.lineHeight = '20px';
	box.getBoundingClientRect = () => ({ right }) as DOMRect;
	text.getBoundingClientRect = () => ({ height: lines * 20 }) as DOMRect;
	act(() => mockBox.onLayout?.({ nativeEvent: { layout: {}, target: box } }));
}
function Cell({ edge }: { edge: number | null }) {
	return (
		<StripEdgeContext.Provider value={edge}>
			<ShippingTitle {...props} />
		</StripEdgeContext.Provider>
	);
}
const lines = () => Number(screen.getByTestId('name').getAttribute('data-lines'));

it('a closed strip (or a touch pointer, which never sets an edge) changes nothing', () => {
	render(<Cell edge={null} />);
	laidOut(400, 1);
	expect(lines()).toBe(2);
	expect(mockBox.style?.paddingRight).toBe(0);
});

it('open on a fine pointer, a one-line name ends clear of the strip on one line', () => {
	const { rerender } = render(<Cell edge={null} />);
	laidOut(400, 1);
	rerender(<Cell edge={300} />);
	// The name ends where the strip's leading edge (less the clearance) is, and ellipsizes.
	expect(mockBox.style?.paddingRight).toBe(100);
	expect(lines()).toBe(1);
	// Narrowed, it lays out again: what it had at rest still holds, so the row keeps its height.
	laidOut(300, 2);
	expect(lines()).toBe(1);
	rerender(<Cell edge={null} />);
	expect(lines()).toBe(2);
	expect(mockBox.style?.paddingRight).toBe(0);
});

it('a two-line name keeps its two lines while open', () => {
	const { rerender } = render(<Cell edge={null} />);
	laidOut(400, 2);
	rerender(<Cell edge={300} />);
	expect(lines()).toBe(2);
});

it('a name already clear of the strip is not padded', () => {
	const { rerender } = render(<Cell edge={null} />);
	laidOut(250, 1);
	rerender(<Cell edge={300} />);
	expect(mockBox.style?.paddingRight).toBe(0);
});
