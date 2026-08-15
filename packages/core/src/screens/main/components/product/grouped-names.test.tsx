/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { GroupedNames } from './grouped-names';

const mockUseCollectionBinding = jest.fn(
	(_collection: unknown, _state: unknown, _options: unknown) => ({
		resource: {
			value: { hits: [{ document: { name: 'Hat' } }, { document: { name: 'Scarf' } }] },
		},
	})
);

jest.mock('../../../../query', () => ({
	useCollectionBinding: (collection: unknown, state: unknown, options: unknown) =>
		mockUseCollectionBinding(collection, state, options),
}));
jest.mock('observable-hooks', () => ({
	useObservableSuspense: (resource: { value: unknown }) => resource.value,
}));
jest.mock('@wcpos/query', () => ({
	useQuery: () => {
		throw new Error('legacy grouped-products query reached');
	},
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

describe('GroupedNames', () => {
	it('reads grouped products through a finite-id collection binding', () => {
		const Cell = GroupedNames as unknown as React.ComponentType<Record<string, unknown>>;
		render(<Cell row={{ original: { document: { grouped_products: [12, 34] } } }} />);

		expect(mockUseCollectionBinding).toHaveBeenCalledWith(
			'products',
			expect.objectContaining({ limit: 2 }),
			{ wooIds: [12, 34] }
		);
		expect(screen.getByText('Hat, Scarf')).toBeTruthy();
	});
});
