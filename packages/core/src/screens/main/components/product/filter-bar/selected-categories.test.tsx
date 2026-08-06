/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import { QueryStateProvider } from '../../../../../query';
import { CategoryPill } from './category-pill';

type Category = { id: number; name: string };

let mockSelectedResource: ObservableResource<Category[]>;

jest.mock('../../../hooks/use-engine-document', () => ({
	useEngineDocumentsByWooId: () => mockSelectedResource,
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/tree-combobox', () => ({
	TreeCombobox: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TreeComboboxContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TreeComboboxTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) =>
		(
			({
				'common.category': 'Category',
				'common.loading': 'Loading…',
			}) as Record<string, string>
		)[key] ?? key,
}));
jest.mock('../category-select', () => ({ CategoryTreeLoader: () => null }));

describe('selected category labels', () => {
	it('keeps a safe fallback until a refreshed category emits its real name', async () => {
		const categories$ = new BehaviorSubject<Category[]>([]);
		mockSelectedResource = new ObservableResource(categories$);

		render(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
				initialFilters={{ categories: [38] }}
			>
				<CategoryPill />
			</QueryStateProvider>
		);

		expect(screen.getByText('Category')).toBeTruthy();
		expect(screen.queryByText('38')).toBeNull();

		act(() => categories$.next([{ id: 38, name: 'Hardware' }]));

		await waitFor(() => expect(screen.getByText('Hardware')).toBeTruthy());
		expect(screen.queryByText('38')).toBeNull();
		mockSelectedResource.destroy();
	});
});
