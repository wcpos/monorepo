/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CustomerList } from './customer-select';

jest.mock('observable-hooks', () => ({
	useObservableSuspense: () => ({ hits: [] }),
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
		ComboboxItem: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
	it('renders the configured guest sentinel with the guest label', () => {
		render(<CustomerList resource={{} as never} withGuest={true} />);

		expect(screen.getByText('common.guest')).toBeTruthy();
	});
});
