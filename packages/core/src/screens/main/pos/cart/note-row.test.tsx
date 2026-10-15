/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NoteRow } from './note-row';
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
it('hides an empty note and opens the sheet for an existing note', () => {
	const onPress = jest.fn();
	const order = { payload: { customer_note: '' } } as React.ComponentProps<typeof NoteRow>['order'];
	const { rerender } = render(<NoteRow order={order} onPress={onPress} />);
	expect(screen.queryByTestId('cart-note-row')).toBeNull();
	order.payload.customer_note = 'Gift';
	rerender(<NoteRow order={order} onPress={onPress} />);
	expect(screen.getByTestId('cart-note-row').textContent).toBe('Gift');
	fireEvent.click(screen.getByTestId('cart-note-row'));
	expect(onPress).toHaveBeenCalledTimes(1);
});
