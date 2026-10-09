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
// The real converter sits behind the locale hook, whose module graph reaches the app state.
jest.mock('../../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(`${value}Z`),
}));
jest.mock('./tab-chip', () => ({ TabChip: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({
		children,
		testID,
		className,
	}: React.PropsWithChildren<{ testID?: string; className?: string }>) => (
		<span data-testid={testID} className={className}>
			{children}
		</span>
	),
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress: () => void; testID: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name, testID }: { name: string; testID?: string }) => (
		<i data-testid={testID} data-icon={name} />
	),
}));
jest.mock('@wcpos/components/avatar', () => ({
	Avatar: ({ fallback }: { fallback: string }) => <b data-testid="avatar">{fallback}</b>,
	getInitials: (name: string) =>
		name
			.split(' ')
			.map((part) => part[0])
			.join(''),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
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

it('a list that is leaving does not pull focus back to its selected row', () => {
	const orders = ['a', 'b'].map((id) => ({
		id,
		record: { uuid: id, payload: { billing: {} } } as EngineRecord<'orders'>,
	}));
	const props = { orders, onSelect: jest.fn(), onClose: jest.fn() };
	const { rerender } = render(
		<>
			<button data-testid="tab" />
			<OpenOrdersList {...props} activeValue="b" />
		</>
	);
	// The cashier picks order a: the strip takes focus, the list starts to leave, and only
	// then does the selection move to row a.
	screen.getByTestId('tab').focus();
	rerender(
		<>
			<button data-testid="tab" />
			<OpenOrdersList {...props} activeValue="a" leaving />
		</>
	);
	expect(document.activeElement).toBe(screen.getByTestId('tab'));
});

it('a row says who, what, how long and its status, and the open one carries a check', () => {
	jest.useFakeTimers().setSystemTime(new Date('2026-10-09T10:30:00Z'));
	try {
		const orders = [
			{
				id: 'a',
				record: {
					uuid: 'a',
					payload: {
						billing: { first_name: 'Ana', last_name: 'López' },
						date_created_gmt: '2026-10-09T10:26:00',
						line_items: [
							{ name: 'Blue T-shirt', quantity: 2 },
							{ name: 'Hoodie &amp; Cap', quantity: 1 },
						],
					},
				} as unknown as EngineRecord<'orders'>,
			},
			{
				id: 'b',
				record: {
					uuid: 'b',
					payload: { billing: {}, date_created_gmt: '2026-10-09T08:00:00', line_items: [] },
				} as unknown as EngineRecord<'orders'>,
			},
		];
		render(
			<OpenOrdersList orders={orders} activeValue="b" onSelect={jest.fn()} onClose={jest.fn()} />
		);
		expect(screen.getByTestId('avatar').textContent).toBe('AL');
		expect(screen.getByTestId('open-orders-row-a-items').textContent).toBe(
			'Blue T-shirt ×2, Hoodie & Cap'
		);
		expect(screen.getByTestId('open-orders-row-a-age').textContent).toBe(
			'health.database.n_minutes'
		);
		expect(screen.queryByTestId('open-orders-row-a-current')).toBeNull();
		// The guest's empty cart: a user mark, "Empty", and an age that has gone stale.
		expect(screen.getByTestId('open-orders-row-b-items').textContent).toBe('pos_cart.cart_empty');
		expect(screen.getByTestId('open-orders-row-b-age').className).toContain('text-warning');
		expect(screen.getByTestId('open-orders-row-b-current')).not.toBeNull();
		expect(screen.getByTestId('open-orders-row-b').textContent).not.toContain('pos_cart.selected');
	} finally {
		jest.useRealTimers();
	}
});
