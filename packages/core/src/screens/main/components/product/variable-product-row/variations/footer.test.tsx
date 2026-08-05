/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { VariationTableFooter } from './footer';

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: {} }),
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../../../components/sync-button', () => ({
	SyncButton: () => null,
}));
jest.mock('../../../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../../../jest/translate')>(
		'../../../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

const binding = {
	active$: of(false),
	total$: of(2),
	sync: jest.fn(async () => undefined),
};

describe('VariationTableFooter', () => {
	it('uses the reactive parent variation count as the denominator', () => {
		const variations$ = new BehaviorSubject([11, 12, 13, 14]);
		const parent = { id: 1, variations: variations$.value, variations$ } as never;

		render(<VariationTableFooter binding={binding} parent={parent} count={2} />);

		expect(screen.getByText('Showing 2 of 4')).toBeTruthy();

		act(() => variations$.next([11, 12, 13, 14, 15]));
		expect(screen.getByText('Showing 2 of 5')).toBeTruthy();
	});

	it('falls back to the binding total when the parent variation list is empty', () => {
		const variations$ = new BehaviorSubject<number[]>([]);
		const parent = { id: 1, variations: variations$.value, variations$ } as never;

		render(<VariationTableFooter binding={binding} parent={parent} count={2} />);

		expect(screen.getByText('Showing 2 of 2')).toBeTruthy();
	});
});
