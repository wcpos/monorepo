/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { DatabaseScreen } from './database';

type TooltipProps = { children: React.ReactNode; showOnNative?: boolean };

const mockTooltip = jest.fn(({ children }: TooltipProps) => <>{children}</>);

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
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/query', () => ({
	prepareCollectionResetRefill: jest.fn(),
	useQueryRuntime: () => ({ engine: { active: jest.fn(), scope: {}, sync: jest.fn() } }),
}));
jest.mock('./attention-panel', () => ({ AttentionPanel: () => null }));
jest.mock('../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../jest/translate')>(
		'../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});
jest.mock('../logs/use-log-stats', () => ({ useLogStats: () => ({ stuck: [] }) }));
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
	useMutationCounts: () => ({ conflicts: 0, pending: 0 }),
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
jest.mock('./use-other-scopes', () => ({
	useOtherScopes: () => ({
		storeCount: 2,
		bytes: 41_000_000,
		sameStoreOtherCashierBytes: 5_000_000,
	}),
}));
jest.mock('./use-relative-time', () => ({
	useNowMs: () => 500,
	useRelativeTime: () => () => 'now',
}));

describe('DatabaseScreen coverage', () => {
	it('enables press-to-show coverage tooltips on native', () => {
		render(<DatabaseScreen />);

		expect(mockTooltip).toHaveBeenCalled();
		expect(mockTooltip.mock.calls.every(([props]) => props.showOnNative === true)).toBe(true);
	});

	it('does not disclose metadata for other store scopes', () => {
		const { queryByText } = render(<DatabaseScreen />);

		expect(queryByText(/This device also stores/)).toBeNull();
	});
});
