/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';

import { OrderStatusBadge, Status } from './status';

import type { CellContext } from '../../../../../table-types';

jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
}));
jest.mock('../../../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({ getLabel: (value: string) => `Server: ${value}` }),
}));
jest.mock('@wcpos/components/status-badge', () => ({
	StatusBadge: ({ label, variant }: { label: string; variant: string }) => (
		<span data-testid="status" data-variant={variant}>
			{label}
		</span>
	),
}));
it.each([
	['completed', 'success'],
	['processing', 'info'],
	['pos-open', 'info'],
	['on-hold', 'warning'],
	['pending', 'warning'],
	['pos-partial', 'warning'],
	['failed', 'error'],
	['cancelled', 'muted'],
	['refunded', 'muted'],
	['trash', 'muted'],
	['custom', 'default'],
])('maps %s and keeps the server label', (status, variant) => {
	render(<OrderStatusBadge status={status} />);
	expect(screen.getByTestId('status').textContent).toBe(`Server: ${status}`);
	expect(screen.getByTestId('status').getAttribute('data-variant')).toBe(variant);
});
it('filters by the status on press', () => {
	const setFilter = jest.fn();
	const props = {
		row: { original: { record: { uuid: 'one', payload: { status: 'completed' } } } },
		table: { options: { meta: { actions: { setFilter } } } },
	} as unknown as CellContext<{ record: EngineRecord<'orders'> }, 'status'>;
	render(<Status {...props} />);
	fireEvent.click(screen.getByRole('button'));
	expect(setFilter).toHaveBeenCalledWith('status', 'completed');
});
