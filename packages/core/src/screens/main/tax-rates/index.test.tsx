/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { DeviceScope } from '@wcpos/components/lib/device';

import { TaxRatesModal } from './index';

import type { QueryStateOf } from '../../../query';

const rates = [
	{ id: 1, name: 'Standard', class: 'standard' },
	{ id: 2, name: 'Reduced', class: 'reduced-rate' },
	{ id: 3, name: 'Second standard', class: 'standard' },
];
// The tax-rates query handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
let mockHandle: FakeHandle;
const mockUseCollectionQueryHandle = jest.fn((_collection: unknown, _state: unknown) => mockHandle);
const mockRateTable = jest.fn(
	(_props: { rates: typeof rates; appliesTo?: ReadonlySet<number> | null }) => null
);
const mockFooter = jest.fn((_props: Record<string, unknown>) => null);

// The route params the "Tax based on" panel sends on View all; none here (opened from elsewhere).
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('../../../query', () => {
	const actual = jest.requireActual('../../../query');
	return {
		...actual,
		useCollectionQueryHandle: (collection: unknown, state: unknown) =>
			mockUseCollectionQueryHandle(collection, state),
	};
});
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
}));
jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => [
		{ name: 'Standard', slug: 'standard' },
		{ name: 'Reduced', slug: 'reduced-rate' },
	],
}));
// The real boundary with a reset control: `TaxRates` wires `onReset` to the handle's retry and
// `resetKeys` to the handle. Every boundary draws the same control, so only the retry tells the
// owner's reset from the modal's (which sits above the owner and cannot reach the handle).
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: ({
			children,
			onReset,
			resetKeys,
		}: {
			children: React.ReactNode;
			onReset?: () => void;
			resetKeys?: unknown[];
		}) => (
			<ErrorBoundary
				onReset={onReset}
				resetKeys={resetKeys}
				fallbackRender={({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => (
					<button data-testid="error-reset" onClick={() => resetErrorBoundary()} />
				)}
			>
				{children}
			</ErrorBoundary>
		),
	};
});
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => (
		<React.Suspense fallback={<div data-testid="tax-rates-fallback" />}>{children}</React.Suspense>
	),
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogClose: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
	DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/tabs', () => ({
	Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollableTabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../contexts/extra-data', () => ({
	useExtraData: () => ({ extraData: { taxClasses$: of([]) } }),
}));
jest.mock('./rate-table', () => ({
	TaxRateTable: (props: Parameters<typeof mockRateTable>[0]) => mockRateTable(props),
}));
jest.mock('./footer', () => ({
	TaxRatesFooter: (props: Record<string, unknown>) => mockFooter(props),
}));

// Pin the layout so it does not depend on jsdom's window: the anchored panel, not the phone page.
function Modal() {
	return (
		<DeviceScope phone={false}>
			<TaxRatesModal />
		</DeviceScope>
	);
}

function latestState(): QueryStateOf<'tax-rates'> {
	const call = mockUseCollectionQueryHandle.mock.calls.at(-1);
	if (!call) throw new Error('tax-rates handle was not acquired');
	return call[1] as QueryStateOf<'tax-rates'>;
}

/** The rate ids per tax class (standard, reduced) in the latest render. */
function lastDrawnIds() {
	return mockRateTable.mock.calls.slice(-2).map(([props]) => props.rates.map((rate) => rate.id));
}

function expectGroupingPreserved() {
	expect(mockRateTable.mock.calls.map(([props]) => props.rates.map((rate) => rate.id))).toEqual([
		[1, 3],
		[2],
	]);
}

const answeredRates = () => ({ hits: rates.map((payload) => ({ record: { payload } })) });

describe('tax-rates query-state wiring', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockHandle = fakeQueryHandle({ result: answeredRates(), total: 3 });
		mockParams = {};
	});
	afterEach(cleanup);

	it('acquires the unsearched, unfiltered Tier-0 tax-rates view and hands the footer the handle', () => {
		render(<Modal />);

		expect(latestState()).toEqual({
			search: '',
			filters: {},
			sort: { field: 'id', direction: 'asc' },
			limit: Number.MAX_SAFE_INTEGER,
		});
		expect(mockUseCollectionQueryHandle.mock.calls.at(-1)?.[0]).toBe('tax-rates');
		expect(mockFooter).toHaveBeenCalledWith({
			count: 3,
			handle: mockHandle,
			shown: mockHandle,
			applies: null,
		});
		expect(mockFooter.mock.calls[0]?.[0]).not.toHaveProperty('query');
		expectGroupingPreserved();
	});

	it('marks and counts the rates the "Tax based on" panel says apply, and none without it', () => {
		const { rerender } = render(<Modal />);
		expect(mockFooter).toHaveBeenLastCalledWith(expect.objectContaining({ applies: null }));
		expect(mockRateTable).toHaveBeenLastCalledWith(expect.objectContaining({ appliesTo: null }));

		// Rate 9 is not in the store's list (deleted since): it is not counted.
		mockParams = { applies: '1,3,9', country: 'GB' };
		rerender(<Modal />);
		expect(mockFooter).toHaveBeenLastCalledWith(
			expect.objectContaining({ applies: { n: 2, country: 'GB' } })
		);
		expect(mockRateTable.mock.calls.at(-2)?.[0]).toMatchObject({ appliesTo: new Set([1, 3, 9]) });
	});

	it('draws the rates the acquired handle answers with', () => {
		render(<Modal />);
		act(() => mockHandle.set({ result: { hits: [{ record: { payload: rates[1] } }] } }));

		expect(lastDrawnIds()).toEqual([[], [2]]);
	});

	/**
	 * The footer's clear-and-sync bumps the coverage generation, which moves the scope key: the
	 * modal is handed a fresh, unanswered handle. It keeps the current rates (and the footer
	 * its total, read off the drawn handle) until that answers, rather than its fallback.
	 */
	it('keeps the current rates and total on screen while a changed handle answers', async () => {
		const previous = mockHandle;
		const { rerender } = render(<Modal />);
		expect(lastDrawnIds()).toEqual([[1, 3], [2]]);

		const next = fakeQueryHandle({ ready: false });
		mockHandle = next;
		await act(async () => rerender(<Modal />));
		expect(mockUseCollectionQueryHandle).toHaveReturnedWith(next);
		expect(screen.queryByTestId('tax-rates-fallback')).toBeNull();
		expect(lastDrawnIds()).toEqual([[1, 3], [2]]);
		// The spinner and sync follow the live handle; the total, the rates beside it.
		expect(mockFooter).toHaveBeenLastCalledWith({
			count: 3,
			handle: next,
			shown: previous,
			applies: null,
		});

		await act(async () =>
			next.set({ ready: true, result: { hits: [{ record: { payload: rates[0] } }] } })
		);
		expect(lastDrawnIds()).toEqual([[1], []]);
		expect(mockFooter).toHaveBeenLastCalledWith({
			count: 1,
			handle: next,
			shown: next,
			applies: null,
		});
	});

	it('throws a failed read to its own boundary, whose reset asks the handle again', async () => {
		const failed = fakeQueryHandle({ ready: false, error: new Error('read failed') });
		const retry = jest.fn(() => failed.set({ error: null, ready: false }));
		failed.retry = retry;
		mockHandle = failed;
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			render(<Modal />);
			expect(screen.getByTestId('error-reset')).toBeTruthy();
			expect(mockRateTable).not.toHaveBeenCalled();

			act(() => {
				fireEvent.click(screen.getByTestId('error-reset'));
			});
			expect(retry).toHaveBeenCalledTimes(1);
			// The reader suspends on the retry instead of throwing the old failure back.
			expect(screen.getByTestId('tax-rates-fallback')).toBeTruthy();

			await act(async () => failed.set({ ready: true, result: answeredRates() }));
			expectGroupingPreserved();
		} finally {
			consoleError.mockRestore();
		}
	});

	it('clears a failed read’s fallback on its own when a fresh handle replaces it', async () => {
		// A scope bump (clear-and-sync) or a changed query hands the owner a new handle; the
		// boundary's keys move with it, so the stale failure leaves without a click.
		const failed = fakeQueryHandle({ ready: false, error: new Error('read failed') });
		const retry = jest.fn();
		failed.retry = retry;
		mockHandle = failed;
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const { rerender } = render(<Modal />);
			expect(screen.getByTestId('error-reset')).toBeTruthy();
			expect(mockRateTable).not.toHaveBeenCalled();

			mockHandle = fakeQueryHandle({ result: answeredRates(), total: 3 });
			await act(async () => rerender(<Modal />));

			expect(screen.queryByTestId('error-reset')).toBeNull();
			expect(retry).not.toHaveBeenCalled();
			expectGroupingPreserved();
		} finally {
			consoleError.mockRestore();
		}
	});
});
