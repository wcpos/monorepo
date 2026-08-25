/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { CustomerList } from './customer-select';

let mockResult: { hits: unknown[] } = { hits: [] };
const mockComboboxItem = jest.fn();
let mockListProps: Record<string, unknown> = {};

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
			...rest
		}: {
			data: unknown[];
			renderItem: ({ item }: { item: unknown }) => React.ReactNode;
		}) => {
			mockListProps = rest;
			return (
				<>
					{data.map((item, index) => (
						<React.Fragment key={index}>{renderItem({ item })}</React.Fragment>
					))}
				</>
			);
		},
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
jest.mock('../../../query', () => ({
	useSearchSelect: jest.fn(),
	// The real guard: what this file pins is the picker's paging, and a hand-rolled stub would
	// only re-state the wiring back to itself.
	useGuardedExtension: jest.requireActual<typeof import('../../../query/use-guarded-extend-limit')>(
		'../../../query/use-guarded-extend-limit'
	).useGuardedExtension,
}));
jest.mock('../hooks/use-customer-name-format/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'registered customer' }),
}));

const hits = (count: number) =>
	Array.from({ length: count }, (_unused, index) => ({
		id: `customer-${index}`,
		record: { uuid: `customer-${index}`, payload: { id: index, email: 'a@example.test' } },
	}));

const binding = (overrides: Record<string, unknown> = {}) =>
	({ resource: {}, limit: 50, extendLimit: () => undefined, ...overrides }) as never;

describe('CustomerList', () => {
	beforeEach(() => {
		mockResult = { hits: [] };
		mockListProps = {};
		mockComboboxItem.mockClear();
	});

	it('renders the configured guest sentinel with the guest label', () => {
		render(<CustomerList binding={binding()} withGuest={true} />);

		expect(screen.getByText('common.guest')).toBeTruthy();
	});

	/**
	 * #1553: the picker rendered a fixed 50 rows and passed no end-reached handler at all, so
	 * a 5,000-customer store could not be scrolled past the first page. Asserting the handler
	 * is PRESENT is not enough — an inert one looks identical from the outside.
	 */
	it('extends the window when the list reaches its end on a full page', () => {
		const extendLimit = jest.fn();
		mockResult = { hits: hits(2) };

		render(<CustomerList binding={binding({ limit: 2, extendLimit })} withGuest={false} />);
		(mockListProps.onEndReached as () => void)();

		expect(extendLimit).toHaveBeenCalledTimes(1);

		// The virtualizer fires end-reached repeatedly while the extension is outstanding;
		// one page per fire would abort and re-issue the wire request each time (#1221).
		(mockListProps.onEndReached as () => void)();
		expect(extendLimit).toHaveBeenCalledTimes(1);
	});

	it('does not extend the window on a short page — a short page IS the end', () => {
		const extendLimit = jest.fn();
		mockResult = { hits: hits(1) };

		render(<CustomerList binding={binding({ limit: 2, extendLimit })} withGuest={false} />);
		(mockListProps.onEndReached as () => void)();

		expect(extendLimit).not.toHaveBeenCalled();
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

		render(<CustomerList binding={binding()} withGuest={false} />);

		expect(mockComboboxItem).toHaveBeenCalledWith(
			expect.objectContaining({ value: '42', label: '42', item: payload })
		);
	});
});
