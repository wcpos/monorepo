/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { RefundOrderModal } from './modal';

type Props = React.PropsWithChildren<{ testID?: string }>;
function mockDiv({ children, testID }: Props) {
	return <div data-testid={testID}>{children}</div>;
}
let mockPayload: { id: number; number?: string } = { id: 42, number: '1001' };
jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => ({ uuid: 'one', payload: mockPayload }),
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (r: unknown, select: (r: unknown) => unknown) => (r ? select(r) : undefined),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: mockDiv,
	DialogContent: mockDiv,
	DialogHeader: mockDiv,
	DialogTitle: mockDiv,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: Props) => <span>{children}</span>,
}));
jest.mock('./form', () => ({ RefundOrderForm: () => <div data-testid="refund-form" /> }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string, vars?: { number?: string | number }) => `${key}:${vars?.number ?? ''}`,
}));

describe('RefundOrderModal title', () => {
	it('carries the order number, not the database id', () => {
		mockPayload = { id: 42, number: '1001' };
		render(<RefundOrderModal resource={{} as never} />);
		expect(screen.getByText('orders.refund_order:1001')).toBeTruthy();
		expect(screen.queryByText('orders.refund_order:42')).toBeNull();
	});

	it('falls back to the id for a record the store has not numbered yet', () => {
		mockPayload = { id: 42 };
		render(<RefundOrderModal resource={{} as never} />);
		expect(screen.getByText('orders.refund_order:42')).toBeTruthy();
	});
});
