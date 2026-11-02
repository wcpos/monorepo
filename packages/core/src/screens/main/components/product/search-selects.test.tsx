/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { CollectionSearch } from './collection-search';

// The search-select handle as a reader sees it (one snapshot, driven with `set`).
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => import('@wcpos/query').QueryHandle;
};
const setSearch = jest.fn();
const mockUseSearchSelect = jest.fn((collection: string) => ({
	handle: fakeQueryHandle({
		result: {
			hits: [
				{
					id: `${collection}-uuid`,
					record: {
						uuid: `${collection}-uuid`,
						remoteId: '42',
						remoteKey: '42',
						payload: { id: 42, name: `${collection} name` },
					},
				},
			],
		},
	}),
	search: '',
	setSearch,
	limit: 50,
	extendLimit: jest.fn(),
}));

jest.mock('../../../../query', () => {
	// The real readers: the lists draw the handle the way the screens do.
	const handles = jest.requireActual<typeof import('@wcpos/query/query-state')>(
		'@wcpos/query/query-state'
	);
	return {
		useSearchSelect: (collection: string) => mockUseSearchSelect(collection),
		useDrawnHandle: handles.useDrawnHandle,
		useQuerySnapshot: handles.useQuerySnapshot,
		useGuardedExtension: jest.requireActual<
			typeof import('../../../../query/use-guarded-extend-limit')
		>('../../../../query/use-guarded-extend-limit').useGuardedExtension,
	};
});
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
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

describe('CollectionSearch', () => {
	beforeEach(() => jest.clearAllMocks());

	it.each(['tag', 'brand'] as const)(
		'binds the %s search through useSearchSelect',
		(collection) => {
			render(<CollectionSearch collection={collection} />);

			expect(mockUseSearchSelect).toHaveBeenCalledWith(collection);
			fireEvent.change(screen.getByRole('textbox'), { target: { value: 'summer' } });
			expect(setSearch).toHaveBeenCalledWith('summer');
		}
	);

	it("builds an option's value and label from the engine record payload", () => {
		render(<CollectionSearch collection="tag" />);

		expect(screen.getByTestId('search-option').getAttribute('data-value')).toBe('42');
		expect(screen.getByTestId('search-option').getAttribute('data-label')).toBe('tag name');
	});
});
