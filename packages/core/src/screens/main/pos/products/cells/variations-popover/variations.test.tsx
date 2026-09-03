/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { QueryStateProvider, useQueryState } from '../../../../../../query';
import { VariationsPopover } from './index';
import { Variations } from './variations';
import { VariableActions } from '../variable-actions';

const mockVariationDocuments = [
	{
		id: 11,
		status: 'draft',
		attributes: [{ id: 1, name: 'Color', option: 'Red' }],
	},
	{
		id: 12,
		status: 'publish',
		attributes: [{ id: 1, name: 'Color', option: 'Blue' }],
		manage_stock: true,
		stock_quantity: 0,
	},
];
const mockSync = jest.fn().mockResolvedValue(undefined);
// When non-null, the binding reports this count (with no hits) - the shape the
// retry effect watches. null = derive count from the filtered documents.
let mockResultCount: number | null = null;
// The most recent result$ subscriber - lets a test emit a later count.
let mockResultNext: ((result: { count: number }) => void) | null = null;
// When true, result$ never emits on subscribe - the count stays at the effect's
// -1 "unknown" sentinel, the shape of a live query delaying its first emission.
let mockResultSilent = false;
const mockUseCollectionBinding = jest.fn(
	(_collection: string, state: { filters: { status?: string } }) => {
		const hits =
			mockResultCount !== null
				? []
				: mockVariationDocuments
						.filter((document) => !state.filters.status || document.status === state.filters.status)
						.map((document) => ({ document, record: { payload: document } }));
		const count = mockResultCount ?? hits.length;
		return {
			resource: { value: { count, hits } },
			result$: {
				subscribe(next: (result: { count: number }) => void) {
					if (!mockResultSilent) next({ count });
					mockResultNext = next;
					return { unsubscribe() {} };
				},
			},
			active$: of(false),
			sync: mockSync,
		};
	}
);

jest.mock('../../../../../../query', () => {
	const actual = jest.requireActual('../../../../../../query');
	return {
		...actual,
		useCollectionBinding: (collection: string, state: { filters: { status?: string } }) =>
			mockUseCollectionBinding(collection, state),
	};
});
jest.mock('observable-hooks', () => ({
	useObservableEagerState: () => false,
	useObservableSuspense: (resource: { value: unknown }) => resource.value,
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (_source: unknown, select: (value: unknown) => unknown) =>
		select({ showOutOfStock: false }),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
	useReplicationState: () => {
		throw new Error('legacy popover replication reached');
	},
}));
jest.mock('@wcpos/components/button', () => ({
	// Mirrors the real Button: `loading` disables the press.
	Button: ({
		children,
		onPress,
		testID,
		loading,
		disabled,
	}: {
		children: React.ReactNode;
		onPress?: () => void;
		testID?: string;
		loading?: boolean;
		disabled?: boolean;
	}) => (
		<button
			data-testid={testID}
			data-loading={String(!!loading)}
			disabled={!!disabled || !!loading}
			onClick={onPress}
		>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./buttons', () => ({
	VariationButtons: ({
		attribute,
		onSelect,
		optionCounts,
		disabledOptions,
	}: {
		attribute: { id: number; name: string; options: string[] };
		onSelect: (attribute: { id: number; name: string; option?: string }) => void;
		optionCounts: Record<string, number>;
		disabledOptions: Record<string, boolean>;
	}) => (
		<>
			{attribute.options
				.filter((option) => optionCounts[option] > 0)
				.map((option) => (
					<button
						key={option}
						data-disabled={String(!!disabledOptions[option])}
						onClick={() => onSelect({ id: attribute.id, name: attribute.name, option })}
					>
						{`select-${option.toLowerCase()}`}
					</button>
				))}
			<button onClick={() => onSelect({ id: 1, name: 'Color' })}>clear-color</button>
		</>
	),
}));
jest.mock('./select', () => ({ VariationSelect: () => null }));
jest.mock('./stock-status', () => ({
	useVariationStock: () => ({ status: 'instock', quantity: null, sellable: true }),
	VariationStockBadge: () => null,
}));
jest.mock('../../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (value: string) => value }),
}));
// For the VariableActions wire test: render popover content inline (always open).
jest.mock('@wcpos/components/popover', () => ({
	Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('../../../hooks/use-add-variation', () => ({
	useAddVariation: () => ({ addVariation: jest.fn() }),
}));
function StateProbe() {
	const matches = useQueryState<'variations', import('../../../../../../query').VariationMatch[]>(
		(state) => state.filters.attributeMatches
	);
	return <div data-testid="popover-matches">{JSON.stringify(matches)}</div>;
}

/**
 * Every test here renders VariationsPopover with NO products QueryStateProvider ancestor.
 * That is deliberate, not an omission: on native, PopoverContent portals its children to
 * the host at the app root, outside every screen provider. Reading the products query
 * state from inside the popover threw "Query state hooks must be used within
 * QueryStateProvider" on iOS — the Stock Status pill now arrives as a prop read at the
 * trigger site. Wrapping these renders in a products provider again would let that
 * regression pass unseen.
 */
describe('Variations popover query state', () => {
	beforeEach(() => {
		mockSync.mockClear();
		mockResultCount = null;
		mockResultNext = null;
		mockResultSilent = false;
	});

	it('refreshes variations once when opened, not when re-rendered', () => {
		const props = {
			parent: {
				payload: {
					variations: [11, 12],
					attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
				},
			} as never,
			addToCart: jest.fn(),
		};
		const { rerender } = render(<VariationsPopover {...props} />);

		expect(mockSync).toHaveBeenCalledTimes(1);

		rerender(<VariationsPopover {...props} />);

		expect(mockSync).toHaveBeenCalledTimes(1);
	});

	it('retries the open refresh while no variations materialize, then stops', async () => {
		// Run 33357460009 (iOS tablet): one refresh, cancelled in 809 ms, no retry,
		// 10 minutes of "Syncing...". The retry loop re-asks on the documented
		// schedule and gives up after the last delay instead of looping forever.
		jest.useFakeTimers();
		try {
			mockResultCount = 0;
			render(
				<VariationsPopover
					parent={
						{
							payload: {
								variations: [11, 12],
								attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
							},
						} as never
					}
					addToCart={jest.fn()}
				/>
			);
			expect(mockSync).toHaveBeenCalledTimes(1);
			// The retry timer is scheduled in the sync() promise's then-chain:
			// flush microtasks before advancing the fake clock.
			await act(async () => {});

			await act(async () => {
				jest.advanceTimersByTime(3000);
			});
			expect(mockSync).toHaveBeenCalledTimes(2);

			await act(async () => {
				jest.advanceTimersByTime(10000);
			});
			expect(mockSync).toHaveBeenCalledTimes(3);

			// Retries spent: the loop must stop, not spin forever.
			await act(async () => {
				jest.advanceTimersByTime(120000);
			});
			expect(mockSync).toHaveBeenCalledTimes(3);
		} finally {
			jest.useRealTimers();
		}
	});

	it('retries even when the refresh never settles (the hang shape)', async () => {
		// Run 33382238335 (iOS phone): the wedge recurred with ZERO retry logs -
		// sync() hung, and a retry chained on resolution never scheduled. The
		// settle timeout must convert the hang into a logged retry.
		jest.useFakeTimers();
		try {
			mockResultCount = 0;
			mockSync.mockImplementation(() => new Promise(() => {}));
			render(
				<VariationsPopover
					parent={
						{
							payload: {
								variations: [11, 12],
								attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
							},
						} as never
					}
					addToCart={jest.fn()}
				/>
			);
			expect(mockSync).toHaveBeenCalledTimes(1);
			await act(async () => {});

			// Settle timeout (15 s) fires, then the first retry delay (3 s).
			await act(async () => {
				jest.advanceTimersByTime(15000 + 3000);
			});
			expect(mockSync).toHaveBeenCalledTimes(2);

			// Second hang: settle timeout again, then the 10 s delay.
			await act(async () => {
				jest.advanceTimersByTime(15000 + 10000);
			});
			expect(mockSync).toHaveBeenCalledTimes(3);

			// Retries spent: the loop stops even though nothing ever settles.
			await act(async () => {
				jest.advanceTimersByTime(600000);
			});
			expect(mockSync).toHaveBeenCalledTimes(3);
		} finally {
			mockSync.mockReset();
			mockSync.mockResolvedValue(undefined);
			jest.useRealTimers();
		}
	});

	it('retries when result$ never emits and the refresh never settles', async () => {
		// CodeRabbit on #1731: with a silent result$ the count stays at the -1
		// sentinel, and a "!== 0" guard read unknown as "variations present" -
		// the settle timeout then exited without logging or retrying, recreating
		// the zero-log wedge this PR fixes. Unknown must be retryable.
		jest.useFakeTimers();
		try {
			mockResultSilent = true;
			mockSync.mockImplementation(() => new Promise(() => {}));
			render(
				<VariationsPopover
					parent={
						{
							payload: {
								variations: [11, 12],
								attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
							},
						} as never
					}
					addToCart={jest.fn()}
				/>
			);
			expect(mockSync).toHaveBeenCalledTimes(1);
			await act(async () => {});

			// Settle timeout (15 s) fires with the count still unknown, then the
			// first retry delay (3 s) - the retry must still be scheduled.
			await act(async () => {
				jest.advanceTimersByTime(15000 + 3000);
			});
			expect(mockSync).toHaveBeenCalledTimes(2);

			await act(async () => {
				jest.advanceTimersByTime(15000 + 10000);
			});
			expect(mockSync).toHaveBeenCalledTimes(3);

			// Retries spent: the loop stops even though the count never reports.
			await act(async () => {
				jest.advanceTimersByTime(600000);
			});
			expect(mockSync).toHaveBeenCalledTimes(3);
		} finally {
			mockSync.mockReset();
			mockSync.mockResolvedValue(undefined);
			jest.useRealTimers();
		}
	});

	it('skips a scheduled retry when variations arrive during the delay', async () => {
		jest.useFakeTimers();
		try {
			mockResultCount = 0;
			render(
				<VariationsPopover
					parent={
						{
							payload: {
								variations: [11, 12],
								attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
							},
						} as never
					}
					addToCart={jest.fn()}
				/>
			);
			expect(mockSync).toHaveBeenCalledTimes(1);
			await act(async () => {});

			// Variations materialize while the first retry timer is pending.
			act(() => {
				mockResultNext?.({ count: 2 });
			});
			await act(async () => {
				jest.advanceTimersByTime(120000);
			});
			expect(mockSync).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	});

	it('does not retry when variations are already materialized', async () => {
		jest.useFakeTimers();
		try {
			render(
				<VariationsPopover
					parent={
						{
							payload: {
								variations: [11, 12],
								attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
							},
						} as never
					}
					addToCart={jest.fn()}
				/>
			);
			expect(mockSync).toHaveBeenCalledTimes(1);
			await act(async () => {});
			await act(async () => {
				jest.advanceTimersByTime(120000);
			});
			expect(mockSync).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	});

	it('holds Add to cart while an add is pending, so a second press cannot add twice', async () => {
		// The popover closes only after the add settles (variable-actions.tsx);
		// until then the button stayed pressable, and a press during a slow write
		// (a starved device, a retry from E2E) enqueued a second line.
		let settle: () => void = () => {};
		const addToCart = jest.fn(
			() =>
				new Promise<void>((resolve) => {
					settle = resolve;
				})
		);
		render(
			<VariationsPopover
				parent={
					{
						payload: {
							variations: [11, 12],
							attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
						},
					} as never
				}
				addToCart={addToCart}
			/>
		);
		const button = () => screen.getByTestId('variation-popover-add-to-cart') as HTMLButtonElement;
		expect(button().disabled).toBe(false);

		await act(async () => {
			button().click();
		});
		expect(addToCart).toHaveBeenCalledTimes(1);
		expect(button().disabled).toBe(true);
		expect(button().dataset.loading).toBe('true');

		// The DOM click is stopped by `disabled`; the handler's own guard must hold too.
		await act(async () => {
			button().click();
		});
		expect(addToCart).toHaveBeenCalledTimes(1);

		await act(async () => {
			settle();
		});
		expect(button().disabled).toBe(false);
		expect(button().dataset.loading).toBe('false');
	});

	it('does not show draft variations', () => {
		render(
			<VariationsPopover
				parent={
					{
						payload: {
							variations: [11, 12],
							attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
						},
					} as never
				}
				addToCart={jest.fn()}
			/>
		);

		expect(screen.queryByText('select-red')).toBeNull();
		expect(screen.queryByText('select-blue')).not.toBeNull();
	});

	it('greys out an unsellable option only while the Stock Status pill narrows the list', () => {
		const props = {
			parent: {
				payload: {
					variations: [11, 12],
					attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
				},
			} as never,
			addToCart: jest.fn(),
		};

		// Blue holds no stock: the pill says In stock, so the option is not selectable.
		const { unmount } = render(<VariationsPopover {...props} stockStatus="instock" />);
		expect(screen.getByText('select-blue').getAttribute('data-disabled')).toBe('true');
		unmount();

		// Pill cleared: every stock state is on show, so every colour can be picked and the
		// disabled Add to Cart button carries the stock news instead.
		render(<VariationsPopover {...props} />);
		expect(screen.getByText('select-blue').getAttribute('data-disabled')).toBe('false');
	});

	it('threads the Stock Status pill from the trigger site into the popover', () => {
		const row = {
			original: {
				record: {
					payload: {
						variations: [11, 12],
						attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
					},
				},
			},
		};
		const Cell = VariableActions as unknown as React.ComponentType<{ row: typeof row }>;

		// The trigger renders inside the products provider; the pill it reads there must
		// reach the (portal-detached) popover and grey out the out-of-stock colour.
		const { unmount } = render(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
				initialFilters={{ stock_status: 'instock' }}
			>
				<Cell row={row} />
			</QueryStateProvider>
		);
		expect(screen.getByText('select-blue').getAttribute('data-disabled')).toBe('true');
		unmount();

		render(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Cell row={row} />
			</QueryStateProvider>
		);
		expect(screen.getByText('select-blue').getAttribute('data-disabled')).toBe('false');
	});

	it('adds and removes an attribute match through the provider actions', () => {
		const Component = Variations as unknown as React.ComponentType<Record<string, unknown>>;
		const binding = {
			resource: {
				value: {
					count: 2,
					hits: [
						{
							document: { id: 11, attributes: [{ id: 1, name: 'Color', option: 'Red' }] },
							record: {
								payload: { id: 11, attributes: [{ id: 1, name: 'Color', option: 'Red' }] },
							},
						},
						{
							document: { id: 12, attributes: [{ id: 1, name: 'Color', option: 'Blue' }] },
							record: {
								payload: { id: 12, attributes: [{ id: 1, name: 'Color', option: 'Blue' }] },
							},
						},
					],
				},
			},
			active$: of(false),
		};
		render(
			<QueryStateProvider
				collection="variations"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Component
					binding={binding}
					parent={{
						payload: {
							attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
						},
					}}
					addToCart={jest.fn()}
				/>
				<StateProbe />
			</QueryStateProvider>
		);

		fireEvent.click(screen.getByText('select-red'));
		expect(screen.getByTestId('popover-matches').textContent).toContain('"option":"Red"');

		fireEvent.click(screen.getByText('clear-color'));
		expect(screen.getByTestId('popover-matches').textContent).toBe('[]');
	});
});
