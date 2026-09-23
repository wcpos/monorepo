import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Numpad } from './index';

jest.mock(
	'@wcpos/hooks/use-merged-ref',
	() => ({ useMergedRef: (...refs: unknown[]) => refs.find((ref) => ref !== null) }),
	{ virtual: true }
);
jest.mock('../icon', () => ({ Icon: () => null }));
jest.mock('../icon-button', () => ({ IconButton: () => null }));
jest.mock('../text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

it('preserves digit, sign and decimal IDs and feeds Keypad presses to the reducer', () => {
	const ref = React.createRef<{ getValue: () => number }>();
	render(<Numpad ref={ref} decimalSeparator="," discounts={[10]} />);
	for (const digit of '0123456789')
		expect(screen.getByTestId(`numpad-key-${digit}`)).toBeInTheDocument();
	fireEvent.click(screen.getByTestId('numpad-key-1'));
	fireEvent.click(screen.getByTestId('numpad-key-2'));
	fireEvent.click(screen.getByTestId('numpad-key-decimal'));
	fireEvent.click(screen.getByTestId('numpad-key-5'));
	expect(ref.current?.getValue()).toBe(12.5);
	fireEvent.click(screen.getByTestId('numpad-key-icon-plusMinus'));
	expect(ref.current?.getValue()).toBe(-12.5);
	fireEvent.click(screen.getByTestId('keypad-key-10'));
	expect(ref.current?.getValue()).toBe(-11.25);
});
