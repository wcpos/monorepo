/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { CensusTotals, EngineCollectionCounts } from '@wcpos/query';

import { SyncStatusStrip } from './sync-status-strip';

import type { SyncStatusState } from './use-sync-status';

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const mockSetFilter = jest.fn();
const mockSetSearch = jest.fn();

let mockDoc: SyncStatusState = {};
let mockCensus: CensusTotals;
let mockCounts: EngineCollectionCounts;
let mockPending = 0;

// @wcpos/components primitives pull raw JSX from node_modules (@rn-primitives/slot)
// that ts-jest does not transform, so render them as plain DOM — the same idiom the
// neighbouring logs tests use (index.test.tsx, filter-bar.test.tsx).
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({
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
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../../query', () => ({
	useQueryStateActions: () => ({ setFilter: mockSetFilter, setSearch: mockSetSearch }),
}));
// use-sync-status (kept real for its card derivation) imports app-state, which pulls
// the RxDB/expo-crypto stack — stub it since the state-doc seam is mocked below.
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ storeDB: { addState: jest.fn() } }),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
}));
jest.mock('../hooks/use-census-totals', () => ({
	useCensusTotals: () => mockCensus,
}));
jest.mock('../hooks/use-engine-monitor', () => ({
	useCollectionCounts: () => mockCounts,
	useMutationCounts: () => ({ pending: mockPending, conflicts: 0 }),
}));
// Keep the real card-derivation + card list; only stub the async state-doc seam so
// the test drives status data directly without an RxDB / AppState provider.
jest.mock('./use-sync-status', () => ({
	...jest.requireActual('./use-sync-status'),
	useSyncStatusResource: () => ({ kind: 'sync-status-resource' }),
	useSyncStatusDoc: () => mockDoc,
}));

const emptyCensus = (): CensusTotals => ({
	orders: null,
	products: null,
	variations: null,
	customers: null,
	taxRates: null,
	categories: null,
	brands: null,
	tags: null,
	coupons: null,
});

describe('SyncStatusStrip', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(Date, 'now').mockReturnValue(NOW);

		mockPending = 3;
		mockDoc = {
			products: { lastCheckedAt: NOW - 2 * MINUTE, lastChangedAt: null, lastError: null },
			orders: {
				lastCheckedAt: NOW - 5 * MINUTE,
				lastChangedAt: null,
				lastError: { at: NOW - HOUR, type: 'apply.pull', message: 'boom' },
			},
		};
		mockCensus = {
			...emptyCensus(),
			products: { total: 2038, updatedAtMs: NOW, fresh: true },
		};
		mockCounts = { orders: 12, products: 1204, variations: 640, customers: 0, taxRates: 3 };
	});

	afterEach(() => {
		(Date.now as jest.Mock).mockRestore();
	});

	it('shows an "of total" count only when a fresh server census exists', () => {
		render(<SyncStatusStrip />);

		expect(screen.getByTestId('sync-status-count-products').textContent).toContain('of');
		expect(screen.getByTestId('sync-status-count-variations').textContent).not.toContain('of');
	});

	it('renders an error badge only for collections with a recent error', () => {
		render(<SyncStatusStrip />);

		expect(screen.getByTestId('sync-status-error-orders')).toBeTruthy();
		expect(screen.queryByTestId('sync-status-error-products')).toBeNull();
		expect(screen.queryByTestId('sync-status-error-variations')).toBeNull();
	});

	it('hides the error badge once the error is older than 24h', () => {
		mockDoc = {
			orders: {
				lastCheckedAt: NOW,
				lastChangedAt: null,
				lastError: { at: NOW - 25 * HOUR, type: 'apply.pull', message: 'stale' },
			},
		};

		render(<SyncStatusStrip />);

		expect(screen.queryByTestId('sync-status-error-orders')).toBeNull();
	});

	it('filters the logs to warnings and errors for the collection when a badge is pressed', () => {
		render(<SyncStatusStrip />);

		fireEvent.click(screen.getByTestId('sync-status-error-orders'));

		expect(mockSetFilter).toHaveBeenCalledWith('level', ['warn', 'error']);
		expect(mockSetSearch).toHaveBeenCalledWith('orders');
	});

	it('renders the engine-wide pending chip only when work is waiting to send', () => {
		const { unmount } = render(<SyncStatusStrip />);
		expect(screen.getByTestId('sync-status-pending')).toBeTruthy();
		unmount();

		mockPending = 0;
		render(<SyncStatusStrip />);
		expect(screen.queryByTestId('sync-status-pending')).toBeNull();
	});
});
