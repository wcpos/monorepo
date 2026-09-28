/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { OpenOrdersList } from './open-orders-list';
jest.mock('../../../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({ getLabel: () => 'Pending' }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (value: T) => unknown) => select(source),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../tab-title', () => ({ CartTabTitle: () => null }));
jest.mock('./tab-chip', () => ({ TabChip: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
it('focuses the current row, selects a row then closes, and provides close', () => {
	const onSelect = jest.fn();
	const onClose = jest.fn();
	const orders = ['a', 'b'].map((id) => ({
		id,
		record: {
			uuid: id,
			payload: { billing: { first_name: 'Ada', last_name: 'Lovelace' } },
		} as EngineRecord<'orders'>,
	}));
	render(<OpenOrdersList orders={orders} activeValue="b" onSelect={onSelect} onClose={onClose} />);
	expect(document.activeElement).toBe(screen.getByTestId('open-orders-row-b'));
	expect(screen.getByTestId('open-orders-row-b').getAttribute('aria-selected')).toBe('true');
	fireEvent.click(screen.getByTestId('open-orders-row-a'));
	expect(onSelect).toHaveBeenCalledWith('a');
	expect(onClose).toHaveBeenCalledWith('a');
	expect(onSelect.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
	fireEvent.click(screen.getByTestId('open-orders-close'));
	expect(onClose).toHaveBeenLastCalledWith();
});
