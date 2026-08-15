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
			hits: [{ id: `${collection}-uuid`, document: { id: 42, name: `${collection} name` } }],
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
	ComboboxList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	ComboboxItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
});
