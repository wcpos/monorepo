/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { GroupedNames } from './grouped-names';

// The grouped products' handle as a reader sees it (one answered snapshot).
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => import('@wcpos/query').QueryHandle;
};
const mockUseCollectionQueryHandle = jest.fn(
	(_collection: unknown, _state: unknown, _options: unknown) =>
		fakeQueryHandle({
			result: {
				hits: [
					{ record: { payload: { name: 'Hat' } } },
					{ record: { payload: { name: 'Scarf' } } },
				],
			},
		})
);

jest.mock('../../../../query', () => ({
	useCollectionQueryHandle: (collection: unknown, state: unknown, options: unknown) =>
		mockUseCollectionQueryHandle(collection, state, options),
	// The real reader: the list reads the handle's snapshot the way the screens do.
	useQuerySnapshot: jest.requireActual<typeof import('@wcpos/query/query-state')>(
		'@wcpos/query/query-state'
	).useQuerySnapshot,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
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
	it('reads grouped products through a finite-id collection handle', () => {
		const Cell = GroupedNames as unknown as React.ComponentType<Record<string, unknown>>;
		render(
			<Cell
				row={{
					original: {
						document: { grouped_products: [12, 34] },
						record: { payload: { grouped_products: [12, 34] } },
					},
				}}
			/>
		);

		expect(mockUseCollectionQueryHandle).toHaveBeenCalledWith(
			'products',
			expect.objectContaining({ limit: 2 }),
			{ remoteIds: ['12', '34'] }
		);
		expect(screen.getByText('Hat, Scarf')).toBeTruthy();
	});
});
