/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { FeeName } from './fee-name';
import { CartTableReadOnlyProvider } from './read-only';
import { ShippingTitle } from './shipping-title';

jest.mock('@wcpos/components/hstack', () => ({ HStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: jest.requireActual('react-native').View }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({
		children,
		decodeHtml,
		className,
		...props
	}: React.PropsWithChildren<{ decodeHtml?: boolean; className?: string }>) => {
		const { Text } = jest.requireActual('react-native');
		const { decode } = jest.requireActual('html-entities');
		return (
			<Text {...props} dataSet={{ classname: className }}>
				{decodeHtml && typeof children === 'string' ? decode(children) : children}
			</Text>
		);
	},
}));
jest.mock('@wcpos/components/editable-field', () => ({ EditableField: () => null }));
jest.mock('../../hooks/use-update-cart-line', () => ({
	useUpdateCartLine: () => ({ updateCartLine: jest.fn() }),
}));

it('fee and shipping names keep their spacing outside the clamp', () => {
	const feeProps = {
		row: {
			original: {
				uuid: 'fee-1',
				type: 'line_items',
				item: { name: 'Delivery &amp; setup', meta_data: [] },
			},
		},
	} as unknown as React.ComponentProps<typeof FeeName>;
	const shippingProps = {
		row: {
			original: {
				uuid: 'shipping-1',
				type: 'line_items',
				item: { method_title: 'Flat rate' },
			},
		},
	} as unknown as React.ComponentProps<typeof ShippingTitle>;
	render(
		<CartTableReadOnlyProvider value={{}}>
			<FeeName {...feeProps} />
			<ShippingTitle {...shippingProps} />
		</CartTableReadOnlyProvider>
	);
	expect(screen.getByText('Delivery & setup').getAttribute('data-classname')).toBe('my-1.5');
	expect(screen.getByText('Flat rate').getAttribute('data-classname')).toBe('my-1.5');
});
