/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { refundValue } from '@wcpos/order-math';

import { RefundsFallback } from './sections/refunds';
import { RefundsBoundary } from './refunds-boundary';

const push = jest.fn();
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => unknown;
};
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 23858, status: 'completed' },
};

jest.mock('react-native', () => ({
	ScrollView: ({ children }: any) => <div data-testid="modal-scroll">{children}</div>,
	View: ({ children, className }: any) => <div className={className}>{children}</div>,
	useWindowDimensions: () => ({ width: 1024 }),
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ push }),
}));

jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => mockOrder,
}));

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: typeof mockOrder, select: (record: typeof mockOrder) => unknown) =>
		select(record),
}));

jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, onPress }: any) => <button onClick={onPress}>{children}</button>,
	ButtonText: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: any) => <>{children}</>,
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

let mockRefundsHandle: unknown = {};
jest.mock('./use-order-refunds', () => ({
	useOrderRefunds: () => mockRefundsHandle,
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../hooks/use-date-format', () => ({ useDateFormat: () => '' }));

it.each([12, undefined])('opens the receipt for refund %s only when it has an id', (id) => {
	mockRefundsHandle = fakeQueryHandle({
		result: { hits: [{ id: 'refund', record: { payload: { id, total: '-5.00' } } }] },
	});
	push.mockClear();
	try {
		render(
			<RefundsBoundary order={mockOrder.payload} orderUuid={mockOrder.uuid} orderId={23858} />
		);
		const button = screen.queryByRole('button', { name: 'common.receipt' });
		if (id) {
			fireEvent.click(button!);
			expect(push).toHaveBeenCalledWith({
				pathname: '/orders/receipt/[orderId]',
				params: { orderId: 'order-uuid', document: 'refund:12' },
			});
		} else {
			expect(button).toBeNull();
		}
	} finally {
		mockRefundsHandle = {};
	}
});

jest.mock('@wcpos/order-math', () => ({
	...jest.requireActual('@wcpos/order-math'),
	refundValue: jest.fn(jest.requireActual('@wcpos/order-math').refundValue),
}));
it.each(['5.00', '-5.00'])('uses the shared refund value in the local summary (%s)', (total) => {
	const refund = { id: 99, total, reason: '' };
	jest.mocked(refundValue).mockClear();
	render(<RefundsFallback refunds={[refund]} onRetry={() => {}} />);
	expect(screen.getByText('-5')).toBeInTheDocument();
	expect(refundValue).toHaveBeenCalledWith(refund);
});
