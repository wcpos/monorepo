/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CustomerList } from './customer-select';

let mockResult: { hits: unknown[] } = { hits: [] };
const mockComboboxItem = jest.fn();

jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => mockResult,
}));

jest.mock('@wcpos/components/avatar', () => ({ Avatar: () => null }));
jest.mock('@wcpos/components/combobox', () => {
	const React = jest.requireActual<typeof import('react')>('react');
	return {
		ComboboxList: ({
			data,
			renderItem,
		}: {
			data: unknown[];
			renderItem: ({ item }: { item: unknown }) => React.ReactNode;
		}) => (
			<>
				{data.map((item, index) => (
					<React.Fragment key={index}>{renderItem({ item })}</React.Fragment>
				))}
			</>
		),
		ComboboxItem: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
			mockComboboxItem(props);
			return <>{children}</>;
		},
		ComboboxEmpty: ({ children }: React.PropsWithChildren) => <>{children}</>,
	};
});
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/sync-core', () => ({
	GUEST_CUSTOMER_ID: 37,
	isGuestCustomer: (id: unknown) => id === 37,
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../query', () => ({ useSearchSelect: jest.fn() }));
jest.mock('../hooks/use-customer-name-format/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'registered customer' }),
}));

describe('CustomerList', () => {
	beforeEach(() => {
		mockResult = { hits: [] };
		mockComboboxItem.mockClear();
	});

	it('renders the configured guest sentinel with the guest label', () => {
		render(<CustomerList resource={{} as never} withGuest={true} />);

		expect(screen.getByText('common.guest')).toBeTruthy();
	});

	it('emits the engine record payload as the selected item', () => {
		const payload = {
			id: 42,
			first_name: 'Ada',
			last_name: 'Lovelace',
			email: 'ada@example.test',
		};
		mockResult = {
			hits: [
				{
					id: 'customer-uuid',
					record: { uuid: 'customer-uuid', payload },
					document: { id: 999, first_name: 'Legacy' },
				},
			],
		};

		render(<CustomerList resource={{} as never} withGuest={false} />);

		expect(mockComboboxItem).toHaveBeenCalledWith(
			expect.objectContaining({ value: '42', label: '42', item: payload })
		);
	});
});
