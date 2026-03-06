/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { PayButton } from './pay';
import { SaveButton } from './save-order';
import { VoidButton } from './void';

const mockUseStorageHealth = jest.fn();

jest.mock('expo-router', () => ({
	useRouter: () => ({
		push: jest.fn(),
		setParams: jest.fn(),
	}),
}));

jest.mock('observable-hooks', () => ({
	useObservableEagerState: jest.fn(() => '10.00'),
}));

jest.mock('react-native', () => ({
	View: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}));

jest.mock(
	'@wcpos/components/button',
	() => ({
		Button: ({ children, disabled, loading, onPress, testID, ...props }: any) =>
			React.createElement(
				'button',
				{ ...props, disabled, onClick: onPress, 'data-testid': testID },
				children
			),
	}),
	{ virtual: true }
);

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string, params?: Record<string, unknown>) => {
		if (key === 'pos_cart.checkout') {
			return `Checkout ${params?.order_total}`;
		}
		return key;
	},
}));

jest.mock('../../../contexts/storage-health/provider', () => ({
	useStorageHealth: () => mockUseStorageHealth(),
}));

jest.mock('../../../contexts/use-push-document', () => ({
	usePushDocument: () => jest.fn(),
}));

jest.mock('../../../contexts/use-delete-document', () => ({
	useDeleteDocument: () => jest.fn(),
}));

jest.mock('../../../hooks/use-current-order-currency-format', () => ({
	useCurrentOrderCurrencyFormat: () => ({
		format: (value: number) => `$${value.toFixed(2)}`,
	}),
}));

jest.mock('../../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: {
			uuid: 'order-uuid',
			id: 42,
			number: '1001',
			total$: {},
			line_items: [],
			toMutableJSON: jest.fn(),
			getLatest: jest.fn(() => ({ id: 42, number: '1001', collection: { name: 'orders' } })),
		},
	}),
}));

describe('POS action buttons in degraded mode', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUseStorageHealth.mockReturnValue({ status: 'degraded', isDegraded: true });
	});

	it('disables the pay button', () => {
		render(React.createElement(PayButton));
		expect((screen.getByRole('button', { name: /checkout/i }) as HTMLButtonElement).disabled).toBe(
			true
		);
	});

	it('disables the save button', () => {
		render(React.createElement(SaveButton));
		expect(
			(
				screen.getByRole('button', {
					name: /pos_cart.save_to_server/i,
				}) as HTMLButtonElement
			).disabled
		).toBe(true);
	});

	it('disables the void button', () => {
		render(React.createElement(VoidButton));
		expect(
			(screen.getByRole('button', { name: /pos_cart.void/i }) as HTMLButtonElement).disabled
		).toBe(true);
	});
});
