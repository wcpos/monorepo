/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { Closures } from './index';
const scope = { from: '2026-09-17', to: '2026-09-17', registerId: 'r', storeId: 1 };
const localRows = [
	{
		id: 'c',
		server_closure_id: 'server',
		business_day: '2026-09-17',
		number: 2,
		expected: {},
		counted: { cash: '99' },
		variance: { cash: '-1' },
		breakdowns: {},
		register_id: 'r',
	},
];
let rows = localRows;
let screenSize = 'sm';
const share = jest.fn(async () => undefined);
jest.mock('./save-or-share-csv', () => ({
	saveOrShareCsv: (...args: unknown[]) => share(...(args as [])),
}));
let status = 'ready';
let unavailableIds = new Set<string>();
const loadMore = jest.fn();
jest.mock('./use-closure-rows', () => ({
	useClosureRows: (requested: { cashier?: number }) => ({
		rows,
		localRows,
		scope: { ...scope, cashier: requested.cashier },
		status,
		loadMore,
		hasMore: true,
		unavailableIds,
	}),
}));
const closureList = jest.fn();
jest.mock('./closure-list', () => ({
	ClosureList: ({
		sessionRows,
		status,
		footer,
		...props
	}: {
		sessionRows: React.ReactNode;
		status: React.ReactNode;
		footer: React.ReactNode;
	}) => (
		<>
			{void closureList(props)}
			{sessionRows}
			{status}
			{footer}
		</>
	),
}));
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({ blind: false }),
}));
jest.mock('./session-cards', () => ({ SessionCards: () => null }));
const sessionCard = jest.fn();
jest.mock('./session-card', () => ({
	SessionCard: (props: unknown) => {
		sessionCard(props);
		return null;
	},
}));
jest.mock('./closure-panel', () => ({
	ClosurePanel: ({ row, onClose }: { row: { id: string }; onClose: () => void }) => (
		<div data-testid="selected-closure">
			{row.id}
			<button data-testid="close-panel" onClick={onClose} />
		</div>
	),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { id: 1, name: 'Café' } }),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => screenSize === 'sm',
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'r' }),
	useRegisterDirectory: () => ({ registers: [] }),
}));
jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({ r: 'Front' }),
}));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
// The bar's icon-only buttons are IconButtons (expo-haptics is ESM, so never loaded here).
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ onPress, testID }: { onPress?: () => void; testID?: string }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: React.PropsWithChildren) => children,
	DropdownMenuContent: ({ children }: React.PropsWithChildren) => children,
	DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => children,
	DropdownMenuItem: ({
		children,
		onPress,
		testID,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
// Revert: export an unscoped collection instead of the exact rows shown.
it('exports only visible rows from the export button', async () => {
	render(
		<Closures
			scope={scope}
			renderScopeRow={({ actions }) => <div data-testid="scope-actions">{actions}</div>}
		/>
	);
	fireEvent.click(screen.getByTestId('closures-export'));
	await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
	expect(share).toHaveBeenCalledWith(
		expect.stringContaining('"2026-09-17","2","Front","Café"'),
		'closures-2026-09-17-2026-09-17.csv'
	);
});
// Revert: ignore the requested closure when the scoped rows become available.
it('opens the route-selected row on a phone', () => {
	render(<Closures scope={scope} initialClosureId="c" />);
	expect(screen.getByTestId('selected-closure').textContent).toBe('c');
});

// Revert: leave failed pages with no list Retry, or collapse loading/unavailable/denied into empty.
it.each(['loading', 'unavailable', 'denied', 'error'])(
	'exposes the distinct %s list state',
	(state) => {
		status = state;
		render(<Closures scope={scope} />);
		expect(screen.getByTestId(`closures-${state}`)).toBeTruthy();
		if (state === 'error') {
			fireEvent.click(screen.getByTestId('closures-retry'));
			expect(loadMore).toHaveBeenCalled();
		}
		status = 'ready';
	}
);
// Revert: never expose the next-page action.
it('loads the next page on demand', () => {
	render(<Closures scope={scope} />);
	fireEvent.click(screen.getByTestId('closures-load-more'));
	expect(loadMore).toHaveBeenCalled();
});

// Revert: allow a drill-in whose canonical server id is marked unavailable.
it('does not open an unavailable server-identified closure', () => {
	unavailableIds = new Set(['server']);
	render(<Closures scope={scope} initialClosureId="c" />);
	expect(screen.queryByTestId('selected-closure')).toBeNull();
	unavailableIds = new Set();
});

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

jest.mock('@wcpos/components/portal', () => ({ PortalHost: () => null }));

// Revert: match only row.id, losing local route UUIDs when paging selects the server copy.
it('keeps a local deep link open after historical paging replaces the row', () => {
	const view = render(<Closures scope={scope} initialClosureId="c" />);
	expect(screen.getByTestId('selected-closure').textContent).toBe('c');
	rows = [{ ...localRows[0], id: 'server' }];
	view.rerender(<Closures scope={scope} initialClosureId="c" />);
	expect(screen.getByTestId('selected-closure').textContent).toBe('server');
	rows = localRows;
});

// Revert: dismiss local selection without notifying the host to consume the deep link.
it.each(['sm', 'lg'])('consumes the deep link when the %s panel closes', (size) => {
	screenSize = size;
	const onClose = jest.fn();
	render(<Closures scope={scope} initialClosureId="c" {...{ onClose }} />);
	fireEvent.click(screen.getByTestId('close-panel'));
	expect(screen.queryByTestId('selected-closure')).toBeNull();
	expect(onClose).toHaveBeenCalledTimes(1);
	screenSize = 'sm';
});

// Revert: feed date/cashier-filtered rows to the current register's last-closure action.
it('does not substitute scoped history for the register last closure', () => {
	render(<Closures scope={scope} />);
	expect(sessionCard).toHaveBeenLastCalledWith({ onSessions: expect.any(Function) });
});

// Revert: count every open session toward a scope that names a cashier.
it('scopes the aggregated sessions and the till card to the named cashier', () => {
	render(<Closures scope={{ ...scope, cashier: 9 }} />);
	expect(sessionCard).toHaveBeenLastCalledWith(expect.objectContaining({ cashier: 9 }));
	const { onSessions } = sessionCard.mock.calls.at(-1)![0] as {
		onSessions: (sessions: { opened_by: number }[]) => void;
	};
	act(() => onSessions([{ opened_by: 7 }, { opened_by: 9 }]));
	expect(closureList).toHaveBeenLastCalledWith(
		expect.objectContaining({ sessions: [{ opened_by: 9 }] })
	);
});

// Revert: swallow CSV failures or return the old adjacent placeholder.
it('keeps export failures in the full-width room without a placeholder pane', async () => {
	share.mockRejectedValueOnce(new Error('share failed'));
	render(<Closures scope={scope} renderScopeRow={({ actions }) => actions} />);
	fireEvent.click(screen.getByTestId('closures-export'));
	await waitFor(() => expect(screen.getByTestId('closures-export-error')).toBeTruthy());
	expect(screen.queryByTestId('closure-panel-placeholder')).toBeNull();
	expect(screen.queryByTestId('closures-overflow')).toBeNull();
});

// Revert: draw the export failure only in the list branch while the phone shows a closure.
it('shows an export failure beside the header while the phone shows a closure', async () => {
	share.mockRejectedValueOnce(new Error('share failed'));
	render(<Closures scope={scope} initialClosureId="c" renderScopeRow={({ actions }) => actions} />);
	expect(screen.getByTestId('selected-closure')).toBeTruthy();
	fireEvent.click(screen.getByTestId('closures-export'));
	await waitFor(() => expect(screen.getByTestId('closures-export-error')).toBeTruthy());
});
