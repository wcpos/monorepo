/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { VariationTableFooter } from './footer';

const engineWrite = jest.fn();
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: { write: engineWrite } }),
}));
const clearAndSync = jest.fn(async () => undefined);
const collectionResetKeys: string[] = [];
jest.mock('../../../../hooks/use-collection-reset', () => ({
	useCollectionReset: (key: string) => {
		collectionResetKeys.push(key);
		return { clear: jest.fn(), clearAndSync };
	},
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
let lastSyncButtonProps: { clearAndSync?: () => Promise<void> } | undefined;
jest.mock('../../../../components/sync-button', () => ({
	SyncButton: (props: { clearAndSync?: () => Promise<void> }) => {
		lastSyncButtonProps = props;
		return null;
	},
}));
jest.mock('../../../../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({ caps: { canDeleteVariations: true }, known: false }),
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

	// #1093: clear-and-refresh is a LOCAL cache eviction. It must ride the
	// guarded reset funnel and must never enqueue engine mutations — a delete
	// written to the engine is a durable server DELETE.
	it('clear-and-refresh resets the local variations collection and never writes to the engine', async () => {
		const variations$ = new BehaviorSubject([11, 12]);
		const parent = { id: 1, variations: variations$.value, variations$ } as never;

		render(<VariationTableFooter binding={binding} parent={parent} count={2} />);

		expect(collectionResetKeys).toContain('variations');
		await act(async () => lastSyncButtonProps?.clearAndSync?.());

		expect(clearAndSync).toHaveBeenCalledTimes(1);
		expect(binding.sync).toHaveBeenCalled();
		expect(engineWrite).not.toHaveBeenCalled();
	});
});
