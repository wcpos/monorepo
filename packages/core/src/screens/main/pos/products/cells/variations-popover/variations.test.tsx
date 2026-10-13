/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

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
// The variations handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
// When non-null, the handle answers this count (with no hits) - the shape the
// retry effect watches. null = derive count from the filtered documents.
let mockResultCount: number | null = null;
// When true, the handle has not answered - the count stays at the effect's
// -1 "unknown" sentinel, the shape of a live query delaying its first answer.
let mockResultSilent = false;
// One handle per query state, as the real registry keys them: a re-render asking the same
// question gets the same handle. The first one asked for is the open refresh's.
const mockHandles = new Map<string, FakeHandle>();
let mockOpenHandle: FakeHandle | null = null;
const mockUseCollectionQueryHandle = jest.fn(
	(_collection: string, state: { filters: { status?: string } }) => {
		const key = JSON.stringify(state);
		const held = mockHandles.get(key);
		if (held) return held;
		const hits =
			mockResultCount !== null
				? []
				: mockVariationDocuments
						.filter((document) => !state.filters.status || document.status === state.filters.status)
						.map((document) => ({ id: String(document.id), record: { payload: document } }));
		const handle = fakeQueryHandle({
			ready: !mockResultSilent,
			result: { hits, count: mockResultCount ?? hits.length },
		});
		handle.sync = mockSync;
		mockHandles.set(key, handle);
		mockOpenHandle ??= handle;
		return handle;
	}
);

jest.mock('../../../../../../query', () => {
	const actual = jest.requireActual('../../../../../../query');
	return {
		...actual,
		useCollectionQueryHandle: (collection: string, state: { filters: { status?: string } }) =>
			mockUseCollectionQueryHandle(collection, state),
	};
});
// The store document the popover reads `prevent_overselling` from (via useAppState +
// useDocField). Tests flip it to prove Add to Cart follows the Avoid overselling switch.
const mockStore = { prevent_overselling: false };
jest.mock('../../../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: mockStore }),
}));
jest.mock('@wcpos/query', () => ({
	// Both answer streams are real, so the refresh's choice between them is what is tested.
	queryHandleAnswers$: jest.requireActual('@wcpos/query').queryHandleAnswers$,
	queryHandleResults$: jest.requireActual('@wcpos/query').queryHandleResults$,
	useDocField: (source: unknown, select: (value: unknown) => unknown) =>
		select(source === mockStore ? mockStore : { showOutOfStock: false }),
	useRecordField: (record: unknown, select: (value: unknown) => unknown) => select(record),
	useReplicationState: () => {
		throw new Error('legacy popover replication reached');
	},
}));
// The Add button's press handler as last rendered: a test calls it past `disabled`, the way a
// press already in flight (or a native gesture) reaches it.
const mockAddPress: { current: (() => void) | undefined } = { current: undefined };
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
	}) => {
		if (testID === 'variation-popover-add-to-cart') mockAddPress.current = onPress;
		return (
			<button
				data-testid={testID}
				data-loading={String(!!loading)}
				disabled={!!disabled || !!loading}
				onClick={onPress}
			>
				{children}
			</button>
		);
	},
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
// The real boundary with a reset control: the popover wires `onReset` to the handles' retry.
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
					<button data-testid="variations-error-reset" onClick={() => resetErrorBoundary()} />
				)}
			>
				{children}
			</ErrorBoundary>
		),
	};
});
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
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
// What the resolved variation's stock reads as; tests set it unsellable to probe the button.
const mockStock = { status: 'instock', quantity: null as number | null, sellable: true };
jest.mock('./stock-status', () => ({
	useVariationStock: (..._args: Parameters<typeof import('./stock-status').useVariationStock>) => ({
		...mockStock,
	}),
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
		mockResultSilent = false;
		mockHandles.clear();
		mockOpenHandle = null;
		mockStore.prevent_overselling = false;
		Object.assign(mockStock, { status: 'instock', quantity: null, sellable: true });
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

	it('retries when the handle never answers and the refresh never settles', async () => {
		// CodeRabbit on #1731: with a silent handle the count stays at the -1
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
				mockOpenHandle?.set({ result: { hits: [], count: 2 } });
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

	it('scrolls the options inside the panel and keeps Add to cart pinned under them', () => {
		// The phone sheet's content ran past the panel's bottom, under the tab bar (Pixel,
		// 2026-10-06, shot 4c): the options are one scrolling region, the outcome sits outside it.
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
		const options = screen.getByTestId('variation-popover-options');
		expect(options.contains(screen.getByText('select-blue'))).toBe(true);
		expect(options.contains(screen.getByTestId('variation-popover-add-to-cart'))).toBe(false);
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

	it('lets an out-of-stock variation into the cart unless the store prevents overselling', () => {
		// Two stores (2026-09-16): "Avoid overselling" off, yet an out-of-stock variation
		// could not be added — the button disabled on `sellable` alone, while a simple
		// product's Add to Cart never disables on stock and the cart guard bypasses its
		// check when the setting is off. The popover must apply the same gate.
		mockStock.status = 'outofstock';
		mockStock.sellable = false;
		const props = {
			parent: {
				payload: {
					variations: [11, 12],
					attributes: [{ id: 1, name: 'Color', variation: true, options: ['Red', 'Blue'] }],
				},
			} as never,
			addToCart: jest.fn(),
		};
		const button = () => screen.getByTestId('variation-popover-add-to-cart') as HTMLButtonElement;

		// Setting off (the plugin default): sell it, exactly like a simple product.
		const { unmount } = render(<VariationsPopover {...props} />);
		expect(button().disabled).toBe(false);
		button().click();
		expect(props.addToCart).toHaveBeenCalledTimes(1);
		unmount();

		// Setting on: refuse up front, as the cart guard would with a toast.
		mockStore.prevent_overselling = true;
		render(<VariationsPopover {...props} />);
		expect(button().disabled).toBe(true);
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
		const handle = fakeQueryHandle({
			result: {
				count: 2,
				hits: [
					{
						id: '11',
						record: {
							payload: { id: 11, attributes: [{ id: 1, name: 'Color', option: 'Red' }] },
						},
					},
					{
						id: '12',
						record: {
							payload: { id: 12, attributes: [{ id: 1, name: 'Color', option: 'Blue' }] },
						},
					},
				],
			},
		});
		render(
			<QueryStateProvider
				collection="variations"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Component
					handle={handle}
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

	it('keeps the options drawn while a pick’s new query answers, and adds only its own match', async () => {
		const addToCart = jest.fn();
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
		// The pick is a new query state, so a new handle, which has not answered yet.
		mockResultSilent = true;
		const before = mockHandles.size;
		await act(async () => fireEvent.click(screen.getByText('select-blue')));
		expect(mockHandles.size).toBe(before + 1);
		const picked = [...mockHandles.values()].at(-1)!;
		expect(picked.value.ready).toBe(false);
		// Suspending here would blank the popover to its fallback on every tap (React hides the
		// suspended content with `display: none`, it does not unmount it): the previous answer's
		// options and outcome stay on show instead.
		const shown = (node: HTMLElement) => {
			for (let at: HTMLElement | null = node; at; at = at.parentElement) {
				if (at.style.display === 'none') return false;
			}
			return true;
		};
		expect(shown(screen.getByTestId('variation-popover-options'))).toBe(true);
		expect(shown(screen.getByTestId('variation-popover-add-to-cart'))).toBe(true);
		// The match on show is the previous pick's: adding it now would put it in the cart under
		// the new pick's attribute meta. Held in place, disabled, and its handler refuses.
		const add = () => screen.getByTestId('variation-popover-add-to-cart') as HTMLButtonElement;
		expect(add().disabled).toBe(true);
		await act(async () => mockAddPress.current?.());
		expect(addToCart).not.toHaveBeenCalled();
		// The pick's own answer: its match is the one to add.
		await act(async () => picked.set({ ready: true }));
		expect(shown(add())).toBe(true);
		expect(add().disabled).toBe(false);
		await act(async () => add().click());
		expect(addToCart).toHaveBeenCalledTimes(1);
		expect(addToCart.mock.calls[0][0]).toBe(picked.value.hits[0].record);
	});

	it('still hears the count after a failed read is retried, so a retry it no longer needs is skipped', async () => {
		// The count stream skips failures: a stream that threw on the failure would close, the
		// count would stay 0 forever, and the refresh would re-ask the server for variations
		// that have since arrived.
		jest.useFakeTimers();
		const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
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
			// The read fails, then the retry answers with the variations the refresh brought.
			act(() => mockOpenHandle?.set({ error: new Error('variations read failed') }));
			act(() => mockOpenHandle?.set({ error: null, result: { hits: [], count: 2 } }));
			await act(async () => {
				jest.advanceTimersByTime(120000);
			});
			expect(mockSync).toHaveBeenCalledTimes(1);
		} finally {
			quiet.mockRestore();
			jest.useRealTimers();
		}
	});

	it('asks the handles to read again when the boundary resets over a failed read', () => {
		const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
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
			const handle = mockOpenHandle!;
			// As the real handle: a retry withdraws the failure and reads again.
			const retry = jest.fn(() => handle.set({ error: null }));
			handle.retry = retry;
			act(() => handle.set({ error: new Error('variations read failed') }));
			expect(screen.queryByText('select-blue')).toBeNull();
			// Without the retry the remounted reader throws the same failure straight back.
			fireEvent.click(screen.getByTestId('variations-error-reset'));
			expect(retry).toHaveBeenCalled();
			expect(screen.getByText('select-blue')).not.toBeNull();
		} finally {
			quiet.mockRestore();
		}
	});
});
