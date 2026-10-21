/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, waitFor } from '@testing-library/react';

import { Toast } from '@wcpos/components/toast';

import { DatabaseScreen } from './database';

import type { StuckRecord } from '../logs/logs-logic';

type TooltipProps = { children: React.ReactNode; showOnNative?: boolean };

const mockTooltip = jest.fn(({ children }: TooltipProps) => <>{children}</>);
const mockMutationCounts = {
	needsDecision: 0,
	needsDecisionRejected: 0,
	needsDecisionUnresolved: 0,
	syncBacklog: 0,
	syncBacklogSales: 0,
};
const mockDeadLetterStuck: StuckRecord[] = [];
let mockConflictedKeys = new Set<string>();
let lastAttentionStuck: StuckRecord[] = [];
let mockLogStats: { stuck: StuckRecord[] } = { stuck: [] };
let mockBackingOff = false;
const mockSync = jest.fn();
const mockCheckCollection = jest.fn();
const defaultStorageFootprint = {
	breakdown: {
		activeDataBytes: 1_000_000,
		bookkeepingBytes: 3 * 1024 * 1024,
		otherCashiersBytes: 5 * 1024 * 1024,
		otherStoresBytes: 40 * 1024 * 1024,
		otherStoresCount: 2,
		orphanedBytes: 0,
		unknownBytes: 0,
		measuredTotalBytes: 51_428_800,
	},
	cachedImagesBytes: 4 * 1024 * 1024,
	browserEstimateBytes: (60 * 1024 * 1024) as number | null,
	totalBytes: 55_622_816,
	unattributedBytes: 0,
};
let mockStorageFootprint = { ...defaultStorageFootprint };
const defaultCensusTotals = {
	products: { total: 2, updatedAtMs: 100, freshUntilMs: 1_000, fresh: true },
};
let mockCensusTotals: Record<
	string,
	{ total: number; updatedAtMs: number; freshUntilMs: number; fresh: boolean }
> = { ...defaultCensusTotals };

jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: (props: TooltipProps) => mockTooltip(props),
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
	TooltipContent: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/alert-dialog', () => {
	function Component({ children }: { children: React.ReactNode }) {
		return <>{children}</>;
	}
	return {
		AlertDialog: Component,
		AlertDialogAction: ({
			children,
			testID,
			onPress,
		}: {
			children: React.ReactNode;
			testID?: string;
			onPress?: () => void;
		}) => (
			<button data-testid={testID} onClick={onPress}>
				{children}
			</button>
		),
		AlertDialogCancel: Component,
		AlertDialogContent: Component,
		AlertDialogDescription: Component,
		AlertDialogFooter: Component,
		AlertDialogHeader: Component,
		AlertDialogTitle: Component,
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
		loading,
	}: {
		children: React.ReactNode;
		testID?: string;
		onPress?: () => void;
		disabled?: boolean;
		loading?: boolean;
	}) => (
		<button
			data-testid={testID}
			onClick={onPress}
			disabled={disabled || loading}
			data-loading={loading ? 'true' : 'false'}
		>
			{children}
		</button>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		name,
		testID,
		onPress,
		disabled,
		loading,
	}: {
		name: string;
		testID?: string;
		onPress?: () => void;
		disabled?: boolean;
		loading?: boolean;
	}) => (
		<button
			data-testid={testID}
			data-icon={name}
			onClick={onPress}
			disabled={disabled || loading}
			data-loading={loading ? 'true' : 'false'}
		/>
	),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/components/dropdown-menu', () => {
	function Component({ children }: { children: React.ReactNode }) {
		return <>{children}</>;
	}
	return {
		DropdownMenu: Component,
		DropdownMenuContent: Component,
		DropdownMenuItem: ({
			children,
			testID,
			onPress,
			variant,
		}: {
			children: React.ReactNode;
			testID?: string;
			onPress?: () => void;
			variant?: string;
		}) => (
			<button data-testid={testID} data-variant={variant ?? 'default'} onClick={onPress}>
				{children}
			</button>
		),
		DropdownMenuSeparator: () => <hr data-testid="menu-separator" />,
		DropdownMenuTrigger: Component,
	};
});
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({
		children,
		testID,
		className,
	}: {
		children: React.ReactNode;
		testID?: string;
		className?: string;
	}) => (
		<div data-testid={testID} className={className}>
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
// Badge reads the real TextClassContext, which this file's Text mock does not provide.
jest.mock('@wcpos/components/badge', () => ({
	Badge: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
type LayoutHandler = (event: { nativeEvent: { layout: { width: number } } }) => void;
const mockLayoutHandlers: Record<string, LayoutHandler> = {};
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({
		children,
		testID,
		className,
		onLayout,
	}: {
		children: React.ReactNode;
		testID?: string;
		className?: string;
		onLayout?: LayoutHandler;
	}) => {
		if (typeof onLayout === 'function' && typeof testID === 'string') {
			mockLayoutHandlers[testID] = onLayout;
		}
		return (
			<div data-testid={testID} className={className}>
				{children}
			</div>
		);
	},
}));
// The shared table: plain elements that keep testID and className, and register the
// root's onLayout as the VStack mock does (the wide/compact switch reads it).
jest.mock('@wcpos/components/table', () => {
	function Cell({
		children,
		testID,
		className,
	}: {
		children?: React.ReactNode;
		testID?: string;
		className?: string;
	}) {
		return (
			<div data-testid={testID} className={className}>
				{children}
			</div>
		);
	}
	return {
		Table: ({
			children,
			testID,
			onLayout,
		}: {
			children: React.ReactNode;
			testID?: string;
			onLayout?: LayoutHandler;
		}) => {
			if (typeof onLayout === 'function' && typeof testID === 'string') {
				mockLayoutHandlers[testID] = onLayout;
			}
			return <div data-testid={testID}>{children}</div>;
		},
		TableCell: Cell,
		TableHead: Cell,
		TableHeader: Cell,
		TableRow: Cell,
	};
});
jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	resetCollectionsAndRefill: jest.requireActual('@wcpos/query').resetCollectionsAndRefill,
	useQueryRuntime: () => ({
		engine: {
			active: jest.fn(),
			scope: { resetCollection: jest.fn().mockResolvedValue('reset') },
			require: jest.fn(() => ({ ready: Promise.resolve(), release: jest.fn() })),
			sync: mockSync,
			checkCollection: mockCheckCollection,
		},
	}),
}));
jest.mock('./attention-panel', () => ({
	// Record the deduped stuck rows the screen hands over, so the
	// one-framing-per-record filter is assertable without rendering the banner.
	AttentionPanel: ({ stuck }: { stuck: StuckRecord[] }) => {
		lastAttentionStuck = stuck;
		return null;
	},
}));
jest.mock('./rejected-mutations', () => ({ RejectedMutationsPanel: () => null }));
jest.mock('./conflicted-mutations', () => ({
	ConflictedMutationsPanel: () => <div data-testid="conflicted-panel-stub" />,
}));
jest.mock('./use-unresolved-conflicts', () => ({
	useUnresolvedConflictKeys: () => mockConflictedKeys,
}));
jest.mock('./queued-emails', () => ({ QueuedEmailsPanel: () => null }));
jest.mock('./registers-panel', () => ({ RegistersPanel: () => null }));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});
jest.mock('../logs/use-log-stats', () => ({
	useLogStats: () => mockLogStats,
}));
jest.mock('./use-dead-letter-attention', () => ({
	...jest.requireActual('./use-dead-letter-attention'),
	useDeadLetterStuckRecords: () => mockDeadLetterStuck,
}));
jest.mock('../hooks/use-census-totals', () => ({
	useCensusTotals: () => mockCensusTotals,
}));
jest.mock('../hooks/use-engine-monitor', () => ({
	useCollectionCounts: () => ({ products: 1 }),
	useEngineStatus: () => ({
		serverPressure: {
			multiplier: mockBackingOff ? 2 : 1,
			retryAfterUntilMs: null,
			reported: null,
			signal: null,
		},
		bootstrapFailed: {},
		connectivity: 'online',
		gatedBy: null,
		lanes: {},
	}),
	useMutationCounts: () => mockMutationCounts,
}));
jest.mock('./components', () => ({
	CoverageBar: ({ percent }: { percent: number }) => <div>{percent}</div>,
	Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
	Stat: () => null,
	StatHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('./use-collection-sizes', () => ({ useCollectionSizes: () => ({}) }));
jest.mock('./use-storage-footprint', () => ({
	useStorageFootprint: () => mockStorageFootprint,
}));
jest.mock('./use-relative-time', () => ({
	useNowMs: () => 500,
	useRelativeTime: () => () => 'now',
}));

describe('DatabaseScreen coverage', () => {
	afterEach(() => {
		mockBackingOff = false;
		mockSync.mockReset();
		mockCheckCollection.mockReset();
		mockMutationCounts.needsDecision = 0;
		mockMutationCounts.needsDecisionRejected = 0;
		mockMutationCounts.needsDecisionUnresolved = 0;
		mockDeadLetterStuck.length = 0;
		mockConflictedKeys = new Set();
		lastAttentionStuck = [];
		mockLogStats = { stuck: [] };
		mockStorageFootprint = { ...defaultStorageFootprint };
		mockCensusTotals = { ...defaultCensusTotals };
	});

	it('shows the last-known total with "checking…" while the census is stale', () => {
		// The change-signal lane expires the census the moment it applies server
		// changes — the row must keep the number the server DID report instead of
		// blanking to "…" or claiming a green bar off the stale denominator.
		mockCensusTotals = {
			products: { total: 203, updatedAtMs: 100, freshUntilMs: 400, fresh: false },
		};
		const { getAllByTestId } = render(<DatabaseScreen />);
		const rowText = getAllByTestId('db-row-products')[0].textContent ?? '';
		expect(rowText).toContain('203');
		expect(rowText).toContain('checking…');
		expect(getAllByTestId('db-row-sm-products')[0].textContent).toContain('checking…');
	});

	it('explains server pressure on stale rows and the census freshness line', () => {
		mockBackingOff = true;
		mockCensusTotals = {
			products: { total: 203, updatedAtMs: 100, freshUntilMs: 400, fresh: false },
		};
		const { getAllByTestId, getByText } = render(<DatabaseScreen />);
		expect(getAllByTestId('db-row-products')[0].textContent).toContain('server busy…');
		expect(getAllByTestId('db-row-sm-products')[0].textContent).toContain('server busy…');
		expect(getByText(/Server totals updated/).textContent).toContain('server is busy');
	});

	it('builds the row menu like every other row menu: a ⋮ icon button, the destructive row last', () => {
		const { getAllByTestId } = render(<DatabaseScreen />);
		expect(getAllByTestId('db-row-menu-products')[0].getAttribute('data-icon')).toBe('more');
		const sync = getAllByTestId('db-row-sync-now-products')[0];
		const clear = getAllByTestId('db-row-clear-products')[0];
		expect(sync.getAttribute('data-variant')).toBe('default');
		// Red by the item's variant, never by a className on its label.
		expect(clear.getAttribute('data-variant')).toBe('destructive');
		const separator = clear.previousElementSibling;
		expect(separator?.getAttribute('data-testid')).toBe('menu-separator');
		expect(separator?.previousElementSibling).toBe(sync);
	});

	it('spins only the checked row and disables manual controls while its check runs', async () => {
		let finish!: (report: unknown) => void;
		mockCheckCollection.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			})
		);

		// The row renders twice (md+ table row and small-screen card), so assert
		// on every instance of the trigger.
		const { getAllByTestId, getByTestId } = render(<DatabaseScreen />);
		const loadingStates = () =>
			getAllByTestId('db-row-menu-products').map((el) => el.getAttribute('data-loading'));
		expect(loadingStates()).not.toContain('true');

		fireEvent.click(getAllByTestId('db-row-sync-now-products')[0]);
		await waitFor(() => expect(loadingStates()).not.toContain('false'));
		expect((getAllByTestId('db-row-menu-products')[0] as HTMLButtonElement).disabled).toBe(true);
		expect(
			getAllByTestId('db-row-menu-orders').every(
				(el) => el.getAttribute('data-loading') === 'false'
			)
		).toBe(true);
		expect((getByTestId('db-check-everything') as HTMLButtonElement).disabled).toBe(true);

		finish({ lane: 'all', status: 'ran' });
		await waitFor(() => expect(loadingStates()).not.toContain('true'));
		expect(
			getAllByTestId('db-row-menu-products').every((el) => !(el as HTMLButtonElement).disabled)
		).toBe(true);
		expect((getByTestId('db-check-everything') as HTMLButtonElement).disabled).toBe(false);
		expect(mockCheckCollection).toHaveBeenCalledWith('products');
		expect(mockSync).not.toHaveBeenCalled();
	});

	it('opens the docs site from the "How syncing works" link', () => {
		const { openExternalURL } = jest.requireMock('@wcpos/utils/open-external-url');
		const { getByTestId } = render(<DatabaseScreen />);

		fireEvent.click(getByTestId('db-how-syncing-works'));

		expect(openExternalURL).toHaveBeenCalledWith('https://docs.wcpos.com/products/sync');
	});

	it('enables press-to-show coverage tooltips on native', () => {
		render(<DatabaseScreen />);

		expect(mockTooltip).toHaveBeenCalled();
		expect(mockTooltip.mock.calls.every(([props]) => props.showOnNative === true)).toBe(true);
	});

	it('picks the table or list row by the measured table width, not the window breakpoint', () => {
		const { getByTestId } = render(<DatabaseScreen />);
		const layout = (width: number) =>
			act(() => mockLayoutHandlers['db-table']({ nativeEvent: { layout: { width } } }));

		// Compact until measured: nothing has told us the table fits.
		expect(getByTestId('db-row-products').className).toContain('hidden');
		expect(getByTestId('db-row-sm-products').className).toContain('flex');

		// Portrait iPad with the drawer rail open: the content column is ~530 px, the
		// window is still ≥ md — the collection column wrapped one character per line.
		layout(530);
		expect(getByTestId('db-row-products').className).toContain('hidden');
		expect(getByTestId('db-row-sm-products').className).toContain('flex');

		layout(760);
		expect(getByTestId('db-row-products').className).toContain('flex');
		expect(getByTestId('db-row-products').className).not.toContain('hidden');
		expect(getByTestId('db-row-sm-products').className).toContain('hidden');
	});

	it('lays the heads, the collection rows and the storage lines on the same columns', () => {
		const { getByTestId } = render(<DatabaseScreen />);
		act(() => mockLayoutHandlers['db-table']({ nativeEvent: { layout: { width: 760 } } }));
		const classes = (testID: string) =>
			Array.from(getByTestId(testID).children).map((cell) => cell.className);
		const head = Array.from(getByTestId('db-table').children[0].children[0].children).map(
			(cell) => cell.className
		);
		const row = classes('db-row-products');
		// Same six columns, the last the menu button's own width (the old w-9 spacer sat
		// 8 px short of the 44 px menu, pushing every head right of its numbers).
		expect(row).toEqual(head);
		expect(row.at(-1)).toContain('w-ctl');
		expect(classes('db-row-cached-images').at(-1)).toBe(row.at(-1));
	});

	it('is an area page: the heading and its subtitle open the card', () => {
		const { getAllByText, getByTestId } = render(<DatabaseScreen />);
		const subtitle =
			'Your store, on this device — sales keep working even if your server does not.';

		// Once, in the heading block, ahead of the summary strip — not repeated in the body.
		expect(getAllByText(subtitle)).toHaveLength(1);
		const text = getByTestId('screen-health-database').textContent ?? '';
		expect(text.startsWith(`Database${subtitle}`)).toBe(true);
	});

	it('keeps the table at the column a 1024 window leaves inside the page card', () => {
		const { getByTestId } = render(<DatabaseScreen />);
		act(() => mockLayoutHandlers['db-table']({ nativeEvent: { layout: { width: 620 } } }));
		expect(getByTestId('db-row-products').className).toContain('flex');
		expect(getByTestId('db-row-products').className).not.toContain('hidden');
	});

	it('does not disclose metadata for other store scopes', () => {
		const { queryByText } = render(<DatabaseScreen />);

		expect(queryByText(/This device also stores/)).toBeNull();
	});

	it('itemizes measured storage as aggregate buckets, hiding empty ones', () => {
		const { getByTestId, getByText, queryByText } = render(<DatabaseScreen />);

		expect(getByText('Other stores on this device (2)')).toBeTruthy();
		expect(getByText('≈ 40 MB')).toBeTruthy();
		expect(getByTestId('db-row-cached-images').textContent).toContain('≈ 4.0 MB');
		// Zero-byte buckets stay off the screen entirely.
		expect(queryByText(/Signed-out stores/)).toBeNull();
	});

	it.each([
		['absolute threshold only', 100 * 1024 * 1024, 120 * 1024 * 1024],
		['percentage threshold only', 20 * 1024 * 1024, 25 * 1024 * 1024],
		['no browser estimate', 20 * 1024 * 1024, null],
	] as const)(
		'hides the browser estimate note for %s',
		(_case, totalBytes, browserEstimateBytes) => {
			mockStorageFootprint = { ...defaultStorageFootprint, totalBytes, browserEstimateBytes };

			const { queryByTestId } = render(<DatabaseScreen />);

			expect(queryByTestId('db-note-browser-estimate')).toBeNull();
		}
	);

	it('shows the browser estimate note only after both thresholds', () => {
		mockStorageFootprint = {
			...defaultStorageFootprint,
			totalBytes: 20 * 1024 * 1024,
			browserEstimateBytes: 30 * 1024 * 1024,
		};

		const { getByTestId } = render(<DatabaseScreen />);

		expect(getByTestId('db-note-browser-estimate').textContent).toBe(
			'Your browser reserves 30 MB for this app. That figure includes privacy padding and internal bookkeeping — the sizes above are what is actually stored.'
		);
	});

	it('mounts the conflicted panel when parked conflicts exist, instead of the old anonymous count', () => {
		mockMutationCounts.needsDecision = 1;
		mockMutationCounts.needsDecisionRejected = 2;
		mockMutationCounts.needsDecisionUnresolved = 1;

		const { getByTestId, queryByText } = render(<DatabaseScreen />);

		expect(getByTestId('conflicted-panel-stub')).toBeTruthy();
		// The anonymous "sale(s)" callout is gone for good: it miscalled every
		// collection a sale and named no record (dev-next 2026-08-14).
		expect(queryByText(/sale\(s\) need attention/)).toBeNull();
	});

	it('does not mount the conflicted panel when there are no parked conflicts', () => {
		const { queryByTestId } = render(<DatabaseScreen />);

		expect(queryByTestId('conflicted-panel-stub')).toBeNull();
	});

	it('keeps one framing per record: a session-stuck row listed in the conflicted panel leaves the attention banner', () => {
		const parked: StuckRecord = {
			key: 'products:8752430f-d36b-4e81-ac7e-36df56a71d1d',
			collection: 'products',
			recordId: '8752430f-d36b-4e81-ac7e-36df56a71d1d',
			reason: 'conflict transition',
			lastSeen: 2,
			attempts: 1,
			eventType: 'queue.write.conflict-transition',
			direction: 'push',
			retryable: false,
		};
		const other: StuckRecord = { ...parked, key: 'products:other', recordId: 'other' };
		mockLogStats = { stuck: [parked, other] };
		mockConflictedKeys = new Set([parked.key]);
		mockMutationCounts.needsDecisionUnresolved = 1;

		render(<DatabaseScreen />);

		const keys = lastAttentionStuck.map((row) => row.key);
		// The unrelated stuck row still reaches the banner — dedupe filters, it
		// doesn't blank the feed.
		expect(keys).toContain(other.key);
		expect(keys).not.toContain(parked.key);
	});

	it('counts durable dead letters in their collection row', () => {
		mockDeadLetterStuck.push({
			key: 'orders:42',
			collection: 'orders',
			recordId: '42',
			reason: 'invalid order',
			lastSeen: 1,
			attempts: 0,
			eventType: 'push.rejected',
			direction: 'push',
			retryable: false,
		});

		const { getAllByText } = render(<DatabaseScreen />);

		expect(getAllByText('1 stuck')).toHaveLength(2);
	});
});

it('shows the refund history policy on the registered Health row', () => {
	const { getByTestId } = render(<DatabaseScreen />);
	expect(getByTestId('db-row-refunds').textContent).toContain(
		'Refunds from the last 92 days, plus any refund of an order you have opened'
	);
});

it('does not claim refund history downloaded after requesting reset refill', async () => {
	const { getByTestId } = render(<DatabaseScreen />);
	fireEvent.click(getByTestId('db-row-clear-confirm-refunds'));
	await waitFor(() =>
		expect(Toast.show).toHaveBeenCalledWith({
			type: 'success',
			text1: 'Refunds cleared — recent history requested again',
		})
	);
});
