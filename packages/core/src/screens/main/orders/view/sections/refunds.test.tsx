/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { of } from 'rxjs';

import { requestStateManager } from '@wcpos/hooks/use-http-client';

import { createTestT } from '../../../../../../jest/translate';
import { RefundsSection } from './refunds';

import type { WCRefund } from '../use-order-refunds';

const mockT = createTestT();
const mockCleanup = jest.fn();

jest.mock('react-native', () => ({
	View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
		<span className={className}>{children}</span>
	),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, onPress }: React.PropsWithChildren<{ onPress: () => void }>) => (
		<button onClick={onPress}>{children}</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('./_section', () => ({
	Section: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => mockT }));
jest.mock('../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `$${n.toFixed(2)}` }),
}));
jest.mock('../../../hooks/use-date-format', () => ({ useDateFormat: () => '' }));
jest.mock('@wcpos/hooks/use-http-client', () => ({
	requestStateManager: { onWake: jest.fn((_callback: () => void) => mockCleanup) },
}));

const order = {
	id: 7,
	currency_symbol: '$',
	refunds: [{ id: 3, reason: 'damaged', total: '-5.00' }],
} as Parameters<typeof RefundsSection>[0]['order'];

beforeEach(() => {
	jest.clearAllMocks();
});

describe('RefundsSection', () => {
	it('renders the offline card with the local refund summary instead of throwing', () => {
		const onRetry = jest.fn();
		render(
			<React.Suspense fallback={null}>
				<RefundsSection
					order={order}
					resource={new ObservableResource<WCRefund[] | null>(of(null))}
					onRetry={onRetry}
				/>
			</React.Suspense>
		);

		expect(screen.getByText(mockT('common.no_internet_connection')).className).toContain(
			'text-muted-foreground'
		);
		expect(screen.getByText(mockT('orders.local_refund_summary'))).not.toBeNull();
		expect(screen.getByText('damaged')).not.toBeNull();
		expect(screen.getByText('$-5.00')).not.toBeNull();
		expect(screen.queryByText(mockT('orders.refunds_load_failed'))).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: mockT('common.retry') }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('retries when the app wakes', () => {
		const onRetry = jest.fn();
		const { unmount } = render(
			<React.Suspense fallback={null}>
				<RefundsSection
					order={order}
					resource={new ObservableResource<WCRefund[] | null>(of(null))}
					onRetry={onRetry}
				/>
			</React.Suspense>
		);

		expect(requestStateManager.onWake).toHaveBeenCalledTimes(1);
		jest.mocked(requestStateManager.onWake).mock.calls[0][0]();
		expect(onRetry).toHaveBeenCalledTimes(1);
		unmount();
		expect(mockCleanup).toHaveBeenCalledTimes(1);
	});
});
