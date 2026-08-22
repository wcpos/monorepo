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
	useRecordField: (
		record: { variations$: BehaviorSubject<number[]> },
		select: (value: { payload: { variations: number[] } }) => unknown
	) => {
		const { useObservableEagerState } = jest.requireActual('observable-hooks');
		const variations$ = record.variations$;
		return select({ payload: { variations: useObservableEagerState(variations$) } });
	},
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

	// A parent payload that has not caught up must never claim fewer variations than are
	// already on screen — "Showing 2 of 0" is self-contradicting. Same resident-count floor
	// every other footer applies.
	it('never claims fewer variations than the rows on screen', () => {
		const variations$ = new BehaviorSubject<number[]>([]);
		const parent = { id: 1, variations: variations$.value, variations$ } as never;

		render(<VariationTableFooter binding={binding} parent={parent} count={2} />);

		expect(screen.getByText('Showing 2 of 2')).toBeTruthy();
	});

	// The other half of the same rule (CodeRabbit, #1492): an EMPTY parent list is the server
	// authoritatively reporting zero variations, so it must not fall through to the local
	// collection's count — which is stale by construction the moment the variations are gone.
	it('preserves an authoritative zero from the parent payload', () => {
		const variations$ = new BehaviorSubject<number[]>([]);
		const parent = { id: 1, variations: variations$.value, variations$ } as never;

		// `binding.total$` is 2 — the stale local collection. It must not surface.
		render(<VariationTableFooter binding={binding} parent={parent} count={0} />);

		expect(screen.getByText('Showing 0 of 0')).toBeTruthy();
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
