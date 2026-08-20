/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { BrandSearch } from './brand-select';
import { CategorySearch } from './category-select';
import { TagSearch } from './tag-select';

const setSearch = jest.fn();
const mockUseSearchSelect = jest.fn((collection: string) => ({
	resource: {
		value: {
			hits: [
				{
					id: `${collection}-uuid`,
					record: {
						uuid: `${collection}-uuid`,
						remoteId: '42',
						payload: { id: 42, name: `${collection} name` },
					},
				},
			],
		},
	},
	search: '',
	setSearch,
}));

jest.mock('../../../../query', () => ({
	useSearchSelect: (collection: string) => mockUseSearchSelect(collection),
}));
jest.mock('@wcpos/query', () => ({
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
}));
jest.mock('observable-hooks', () => ({
	useObservableSuspense: (resource: { value: unknown }) => resource.value,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/combobox', () => ({
	ComboboxInput: ({
		value,
		onChangeText,
	}: {
		value: string;
		onChangeText: (value: string) => void;
	}) => <input value={value} onChange={(event) => onChangeText(event.currentTarget.value)} />,
	ComboboxList: ({
		data,
		renderItem,
	}: {
		data: { value: string; label: string }[];
		renderItem: (info: { item: { value: string; label: string } }) => React.ReactNode;
	}) => (
		<div>
			{data.map((item) => (
				<React.Fragment key={item.value}>{renderItem({ item })}</React.Fragment>
			))}
		</div>
	),
	ComboboxItem: ({
		value,
		label,
		children,
	}: {
		value: string;
		label: string;
		children: React.ReactNode;
	}) => (
		<div data-testid="search-option" data-value={value} data-label={label}>
			{children}
		</div>
	),
	ComboboxItemText: () => null,
	ComboboxEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/core/contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('product filter search selects', () => {
	beforeEach(() => jest.clearAllMocks());

	it.each([
		['category', CategorySearch],
		['tag', TagSearch],
		['brand', BrandSearch],
	] as const)('binds %s search through useSearchSelect', (collection, Search) => {
		render(<Search />);

		expect(mockUseSearchSelect).toHaveBeenCalledWith(collection);
		fireEvent.change(screen.getByRole('textbox'), { target: { value: 'summer' } });
		expect(setSearch).toHaveBeenCalledWith('summer');
	});

	it('builds a category option value and label from the engine record payload', () => {
		render(<CategorySearch />);

		expect(screen.getByTestId('search-option').getAttribute('data-value')).toBe('42');
		expect(screen.getByTestId('search-option').getAttribute('data-label')).toBe('category name');
	});
});
