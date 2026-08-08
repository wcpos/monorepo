/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { DatabaseScreen } from './database';

import type { StuckRecord } from '../logs/logs-logic';

type TooltipProps = { children: React.ReactNode; showOnNative?: boolean };

const mockTooltip = jest.fn(({ children }: TooltipProps) => <>{children}</>);
const mockMutationCounts = {
	conflicts: 0,
	pending: 0,
	rejected: 0,
	unresolvedConflicts: 0,
};
const mockDeadLetterStuck: StuckRecord[] = [];

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
		AlertDialogAction: Component,
		AlertDialogCancel: Component,
		AlertDialogContent: Component,
		AlertDialogDescription: Component,
		AlertDialogFooter: Component,
		AlertDialogHeader: Component,
		AlertDialogTitle: Component,
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
	ButtonText: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/dialog', () => {
	function Component({ children }: { children: React.ReactNode }) {
		return <>{children}</>;
	}
	return {
		Dialog: Component,
		DialogBody: Component,
		DialogContent: Component,
		DialogHeader: Component,
		DialogTitle: Component,
		DialogTrigger: Component,
	};
});
jest.mock('@wcpos/components/dropdown-menu', () => {
	function Component({ children }: { children: React.ReactNode }) {
		return <>{children}</>;
	}
	return {
		DropdownMenu: Component,
		DropdownMenuContent: Component,
		DropdownMenuItem: Component,
		DropdownMenuTrigger: Component,
	};
});
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({
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
jest.mock('@wcpos/query', () => ({
	COLLECTION_VOCABULARY: jest.requireActual('@wcpos/query').COLLECTION_VOCABULARY,
	runResetRefill: jest.fn(),
	useQueryRuntime: () => ({
		engine: { active: jest.fn(), scope: {}, sync: jest.fn() },
	}),
}));
jest.mock('./attention-panel', () => ({ AttentionPanel: () => null }));
jest.mock('./rejected-mutations', () => ({ RejectedMutationsPanel: () => null }));
jest.mock('./queued-emails', () => ({ QueuedEmailsPanel: () => null }));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});
jest.mock('../logs/use-log-stats', () => ({
	useLogStats: () => ({ stuck: [] }),
}));
jest.mock('./use-dead-letter-attention', () => ({
	...jest.requireActual('./use-dead-letter-attention'),
	useDeadLetterStuckRecords: () => mockDeadLetterStuck,
}));
jest.mock('../hooks/use-census-totals', () => ({
	useCensusTotals: () => ({
		products: { total: 2, updatedAtMs: 100, freshUntilMs: 1_000, fresh: true },
	}),
}));
jest.mock('../hooks/use-engine-monitor', () => ({
	useCollectionCounts: () => ({ products: 1 }),
	useEngineStatus: () => ({
		bootstrapFailed: {},
		connectivity: 'online',
		gatedBy: null,
		lanes: {},
	}),
	useMutationCounts: () => mockMutationCounts,
}));
jest.mock('./components', () => ({
	Callout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CoverageBar: ({ percent }: { percent: number }) => <div>{percent}</div>,
	HairlineHeaderCell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	HairlineHeaderRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
	Stat: () => null,
	StatHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('./use-collection-sizes', () => ({ useCollectionSizes: () => ({}) }));
jest.mock('./use-storage-footprint', () => ({
	useStorageFootprint: () => ({
		breakdown: {
			activeDataBytes: 1_000_000,
			searchIndexBytes: 2 * 1024 * 1024,
			bookkeepingBytes: 3 * 1024 * 1024,
			otherCashiersBytes: 5 * 1024 * 1024,
			otherStoresBytes: 40 * 1024 * 1024,
			otherStoresCount: 2,
			orphanedBytes: 0,
			unknownBytes: 0,
			measuredTotalBytes: 51_428_800,
		},
		estimateBytes: 60 * 1024 * 1024,
		totalBytes: 60 * 1024 * 1024,
		unattributedBytes: 9 * 1024 * 1024,
	}),
}));
jest.mock('./use-relative-time', () => ({
	useNowMs: () => 500,
	useRelativeTime: () => () => 'now',
}));

describe('DatabaseScreen coverage', () => {
	afterEach(() => {
		mockMutationCounts.conflicts = 0;
		mockMutationCounts.rejected = 0;
		mockMutationCounts.unresolvedConflicts = 0;
		mockDeadLetterStuck.length = 0;
	});

	it('enables press-to-show coverage tooltips on native', () => {
		render(<DatabaseScreen />);

		expect(mockTooltip).toHaveBeenCalled();
		expect(mockTooltip.mock.calls.every(([props]) => props.showOnNative === true)).toBe(true);
	});

	it('keeps the wider health layout with the shared screen spacing', () => {
		const { getByTestId } = render(<DatabaseScreen />);

		expect(getByTestId('screen-health-database').className).toBe(
			'mx-auto w-full max-w-4xl gap-4 px-4 py-6 md:px-10 md:py-8'
		);
	});

	it('does not disclose metadata for other store scopes', () => {
		const { queryByText } = render(<DatabaseScreen />);

		expect(queryByText(/This device also stores/)).toBeNull();
	});

	it('itemizes measured storage as aggregate buckets, hiding empty ones', () => {
		const { getByText, queryByText } = render(<DatabaseScreen />);

		expect(getByText('Search indexes')).toBeTruthy();
		expect(getByText('≈ 2.0 MB')).toBeTruthy();
		expect(getByText('Other stores on this device (2)')).toBeTruthy();
		expect(getByText('≈ 40 MB')).toBeTruthy();
		// Zero-byte buckets stay off the screen entirely.
		expect(queryByText(/Signed-out stores/)).toBeNull();
	});

	it('renders the independently observed unresolved-conflict count', () => {
		mockMutationCounts.conflicts = 1;
		mockMutationCounts.rejected = 2;
		mockMutationCounts.unresolvedConflicts = 1;

		const { getByText } = render(<DatabaseScreen />);

		expect(
			getByText('1 sale(s) need attention — changed on the server while a till was editing.')
		).toBeTruthy();
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
