/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { RemoteSessionCard, SessionCard } from './session-card';
import { Closures } from './index';
jest.mock('@wcpos/components/text', () => ({ Text: require('react-native').Text }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		onPress,
		testID,
		children,
		disabled,
	}: {
		onPress: () => void;
		testID: string;
		children: React.ReactNode;
		disabled?: boolean;
	}) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled}>
			{children}
		</button>
	),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
const credentials = of([{ id: 7, display_name: 'Pat' }]);
const viewedStores = of([
	{
		id: 2,
		timezone: 'Asia/Tokyo',
		currency: 'JPY',
		currency_pos: 'left',
		price_num_decimals: 0,
		price_decimal_sep: '.',
		price_thousand_sep: ',',
	},
]);
const appState = () => ({
	store: {
		id: 1,
		timezone: 'UTC',
		currency: 'GBP',
		currency_pos: 'left',
		price_num_decimals: 2,
		price_decimal_sep: '.',
		price_thousand_sep: ',',
	},
	wpCredentials: {
		capabilities: blind ? [] : ['view_woocommerce_pos_reports'],
		populate$: () => viewedStores,
	},
	site: { populate$: () => credentials },
});
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => appState(),
	useStoreSession: () => appState(),
}));
let session: { opened_at_gmt: string; opened_by: number; status: string } | null;
let blind = false;
let lastClosure: { id: string } | null = { id: 'c' };
const print = jest.fn(async () => true);
const reprint = jest.fn(async () => true);
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		session,
		blind,
		expected: { cash: '155' },
		salesCount: 3,
		binding: { registerId: 'front', registerName: 'Front' },
		lastClosure,
	}),
}));
jest.mock('../../../../services/register-session/use-session-report', () => ({
	useSessionReport: (closure?: unknown, _isReprint?: boolean, known?: unknown) => ({
		print: closure || known ? reprint : print,
	}),
}));
beforeEach(() => {
	jest.clearAllMocks();
	blind = false;
	lastClosure = { id: 'c' };
	session = { opened_at_gmt: '2026-09-17T09:00:00Z', opened_by: 7, status: 'open' };
});
// Revert: render expected cash without the reports capability, or omit the card's session metadata.
it('keeps expected hidden for blind cashiers but retains the opener and sales count', () => {
	blind = true;
	render(<SessionCard />);
	expect(screen.queryByTestId('session-expected')).toBeNull();
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Pat');
	expect(screen.getByTestId('reports-session-card').textContent).toContain('3');
	expect(screen.getByTestId('reports-session-card').textContent).not.toContain('155');
});
// Revert: omit the closed branch or dispatch X rather than the last closure.
it('offers the local last closure Reprint offline when the register is closed', async () => {
	session = null;
	online = false;
	render(<SessionCard />);
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Register closed');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(reprint).toHaveBeenCalledTimes(1));
	expect(print).not.toHaveBeenCalled();
	expect(get).not.toHaveBeenCalled();
});
// Revert: omit the X-report action, its expected drawer, or print failure feedback.
// Revert: stringify the known failure key, or replace unexpected errors with generic copy.
it.each([
	['reports.reprint_failed', 'Printing failed. Try again.'],
	['paper', 'Error: paper'],
])('prints the live X-report and displays the %s failure', async (message, expected) => {
	print.mockRejectedValueOnce(new Error(message));
	render(<SessionCard />);
	expect(screen.getByTestId('session-expected').textContent).toContain('£155.00');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(screen.getByTestId('session-print-error').textContent).toBe(expected));
});

const get = jest.fn();
const http = { get };
let online = true;
const documentHook = jest.fn((_args: unknown) => ({ print }));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => http }));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: online ? 'online-website-available' : 'offline' }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => (doc ? pick(doc) : undefined),
}));
jest.mock('../../receipt/use-receipt-document', () => ({
	useReceiptDocument: (args: unknown) => documentHook(args as never),
}));
beforeEach(() => {
	online = true;
	get.mockReset().mockImplementation(async (url, config) => ({
		data:
			url === 'sessions'
				? config.params.status === 'counting'
					? [{ id: 'remote' }]
					: []
				: url === 'sessions/remote'
					? {
							id: 'remote',
							register_id: 'back',
							status: 'counting',
							opened_at_gmt: '2026-09-17 09:00:00',
							opened_by: 7,
							sales_count: 12,
							expected: { cash: '200' },
						}
					: null,
	}));
});
// Revert: omit storeId in SessionCardContent day/currency hooks or fail to pass the remote store id.
it('loads a remote counting session and prints its X document, retaining it offline', async () => {
	const view = render(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	await waitFor(() => expect(screen.getByTestId('session-expected').textContent).toContain('¥200'));
	expect(screen.getByTestId('reports-session-card').textContent).toContain('12');
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Back');
	// Revert: parse the server SQL UTC opening time as device-local time.
	expect(screen.getByTestId('reports-session-card').textContent).toContain('18:00');
	expect(get).toHaveBeenCalledWith(
		'sessions',
		expect.objectContaining({
			params: expect.objectContaining({ register_id: 'back', status: 'open', store_id: 2 }),
		})
	);
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({ document: 'xreport:remote', storeId: 2, templateType: 'closure' })
	);
	online = false;
	view.rerender(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	expect(screen.getByTestId('session-expected').textContent).toContain('¥200');
	expect(screen.getByTestId('session-unavailable')).toBeTruthy();
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(true);
});
// Revert: expose remote expected figures without the reports capability.
it('does not expose remote expected figures to a blind cashier', async () => {
	blind = true;
	render(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	await waitFor(() =>
		expect(screen.getByTestId('reports-session-card').textContent).toContain('12')
	);
	expect(screen.queryByTestId('session-expected')).toBeNull();
});
// Revert: read the local last closure for a remote closed register.
it.each([0, 2])(
	'uses the remote last closure for a closed register in store %s',
	async (storeId) => {
		get.mockImplementation(async (url) => ({
			data: url === 'sessions' ? [] : { id: 'last-remote', number: 5 },
		}));
		render(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={storeId} />);
		await waitFor(() =>
			expect(screen.getByTestId('reports-session-card').textContent).toContain('Register closed')
		);
		expect(get).toHaveBeenCalledWith(
			'closures/last',
			expect.objectContaining({ params: { register_id: 'back', store_id: storeId || null } })
		);
		expect(documentHook).toHaveBeenLastCalledWith(
			expect.objectContaining({ document: 'closure:last-remote', isReprint: true })
		);
	}
);

// Revert: choose a scope-filtered historical row or omit the bound register's last-closure read.
it('fetches the actual last closure when the bound closed register has no local closure', async () => {
	session = null;
	lastClosure = null;
	get.mockImplementation(async (url) => ({
		data: url === 'sessions' ? [] : { id: 'latest', number: 9 },
	}));
	render(<SessionCard />);
	await waitFor(() => expect(screen.getByTestId('reports-session-print')).toBeTruthy());
	expect(get).toHaveBeenCalledWith('closures/last', {
		params: { register_id: 'front', store_id: 1 },
	});
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({ document: 'closure:latest', isReprint: true })
	);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
	expect(reprint).not.toHaveBeenCalled();
});

// Revert: show an actionable local card while closures/last is pending, or ignore its server row.
it('replaces local A with authoritative B for the bound register card and Reprint', async () => {
	session = null;
	lastClosure = { id: 'A' };
	let resolve!: (value: { data: { id: string; number: number } }) => void;
	const pending = new Promise((done) => {
		resolve = done;
	});
	get.mockImplementation(async (url) => (url === 'sessions' ? { data: [] } : pending));
	const view = render(<SessionCard />);
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Register closed');
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByTestId('session-unavailable').textContent).toContain('Loading');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	expect(reprint).not.toHaveBeenCalled();
	await waitFor(() =>
		expect(get).toHaveBeenCalledWith('closures/last', {
			params: { register_id: 'front', store_id: 1 },
		})
	);
	await act(async () => {
		resolve({ data: { id: 'B', number: 10 } });
	});
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({ document: 'closure:B', isReprint: true })
	);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
	expect(reprint).not.toHaveBeenCalled();
	expect(screen.queryByTestId('session-unavailable')).toBeNull();
	online = false;
	view.rerender(<SessionCard />);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(reprint).toHaveBeenCalledTimes(1));
});

// Revert: hide the lookup error behind the local card or allow its stale closure to print.
it('disables the local Reprint after a failed lookup and retries to the server closure', async () => {
	session = null;
	lastClosure = { id: 'A' };
	get.mockImplementation(async (url) => {
		if (url === 'sessions') return { data: [] };
		throw new Error('lookup failed');
	});
	render(<SessionCard />);
	await waitFor(() => expect(screen.getByTestId('session-retry-front')).toBeTruthy());
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByTestId('session-unavailable').textContent).toBe('Could not load closures');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	expect(reprint).not.toHaveBeenCalled();
	get.mockImplementation(async (url) => ({
		data: url === 'sessions' ? [] : { id: 'B', number: 10 },
	}));
	fireEvent.click(screen.getByTestId('session-retry-front'));
	await waitFor(() => expect(screen.queryByTestId('session-unavailable')).toBeNull());
	expect(screen.queryByTestId('session-retry-front')).toBeNull();
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(false);
	expect(documentHook).toHaveBeenLastCalledWith(
		expect.objectContaining({ document: 'closure:B', isReprint: true })
	);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
	expect(reprint).not.toHaveBeenCalled();
});

// Revert: load only idle cards, retaining the old authoritative closure after reconnect.
it('reloads a ready remote card on reconnect and replaces its Reprint document', async () => {
	get.mockImplementation(async (url) => ({ data: url === 'sessions' ? [] : { id: 'A' } }));
	const view = render(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	await waitFor(() =>
		expect(documentHook).toHaveBeenLastCalledWith(
			expect.objectContaining({ document: 'closure:A' })
		)
	);
	online = false;
	view.rerender(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	expect((screen.getByTestId('reports-session-print') as HTMLButtonElement).disabled).toBe(true);
	get
		.mockClear()
		.mockImplementation(async (url) => ({ data: url === 'sessions' ? [] : { id: 'B' } }));
	online = true;
	view.rerender(<RemoteSessionCard register={{ id: 'back', name: 'Back' }} storeId={2} />);
	await waitFor(() =>
		expect(documentHook).toHaveBeenLastCalledWith(
			expect.objectContaining({ document: 'closure:B' })
		)
	);
	expect(get).toHaveBeenCalledTimes(3);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
});

const allRegisters = Array.from({ length: 20 }, (_, index) => ({
	id: `r${index}`,
	name: `Register ${index}`,
	status: 'active',
}));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'front' }),
	useRegisterDirectory: () => ({ registers: allRegisters }),
}));
jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({}),
}));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'lg' }) }));
jest.mock('./closure-panel', () => ({ ClosurePanel: () => null }));
jest.mock('./closure-list', () => ({ ClosureList: () => null }));
jest.mock('./save-or-share-csv', () => ({ saveOrShareCsv: jest.fn() }));
jest.mock('./use-closure-rows', () => ({
	useClosureRows: (scope: unknown) => ({
		scope,
		rows: [],
		localRows: [],
		status: 'ready',
		unavailableIds: new Set(),
	}),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/portal', () => ({ PortalHost: () => null }));
jest.mock('@wcpos/components/dropdown-menu', () => {
	const Pass = ({ children }: React.PropsWithChildren) => children;
	return {
		DropdownMenu: Pass,
		DropdownMenuContent: Pass,
		DropdownMenuItem: Pass,
		DropdownMenuTrigger: Pass,
	};
});

// Revert: mount independently loading cards, issuing two session reads and a detail per register.
// Revert: dispatch every closed-register detail at once instead of sharing three workers.
it('batches all-register sessions and limits closed-register reads to three concurrent requests', async () => {
	const summaries = allRegisters.slice(0, 16).map((register, index) => ({
		id: `s${index}`,
		register_id: register.id,
		status: index % 2 ? 'counting' : 'open',
		opened_at_gmt: '2026-09-17 09:00:00',
		opened_by: 7,
	}));
	let active = 0;
	let peak = 0;
	const complete: (() => void)[] = [];
	get.mockImplementation(async (url, config) => {
		if (url === 'sessions') return { data: summaries };
		if (url !== 'closures/last') throw new Error(`Unexpected detail: ${url}`);
		active++;
		peak = Math.max(peak, active);
		return new Promise((resolve) =>
			complete.push(() => {
				active--;
				resolve({ data: { id: `last-${config.params.register_id}` } });
			})
		);
	});
	render(<Closures scope={{ from: '2026-09-17', to: '2026-09-17', storeId: 2, registerId: '' }} />);
	await waitFor(() => expect(get).toHaveBeenCalled());
	expect(get.mock.calls.filter(([url]) => url === 'sessions')).toHaveLength(1);
	await waitFor(() => expect(complete).toHaveLength(3));
	expect(get).toHaveBeenCalledWith('sessions', {
		params: { store_id: 2, status: 'all', per_page: 100, page: 1 },
	});
	expect(screen.getAllByTestId('reports-session-card')).toHaveLength(16);
	// Missing summary figures are unknown, not zero sales or a zero drawer.
	expect(screen.queryByTestId('session-expected')).toBeNull();
	expect(screen.getAllByTestId('reports-session-card')[0].textContent).not.toContain('0 sales');
	await act(async () => {
		complete[0]();
	});
	await waitFor(() => expect(complete).toHaveLength(4));
	expect(peak).toBe(3);
	await act(async () => {
		complete.slice(1).forEach((done) => done());
	});
	await waitFor(() => expect(screen.getAllByTestId('reports-session-card')).toHaveLength(20));
	expect(get).toHaveBeenCalledTimes(5);
	for (const index of [16, 17, 18, 19]) {
		expect(get).toHaveBeenCalledWith('closures/last', {
			params: { store_id: 2, register_id: `r${index}` },
		});
	}
});

// Revert: stop at the first full sessions page; Retry repeats that same incomplete read.
it.each([false, true])('resolves a register on page 2 (retry: %s)', async (retry) => {
	let fail = retry;
	get.mockImplementation(async (url, config) => {
		if (url !== 'sessions') return { data: { id: 'old-closure' } };
		if ((config.params.page ?? 1) === 1)
			return {
				data: Array.from({ length: 100 }, (_, index) => ({
					id: `old${index}`,
					register_id: 'r0',
					status: 'closed',
				})),
			};
		if (fail) {
			fail = false;
			throw new Error('temporarily unavailable');
		}
		return {
			data: [
				{
					id: 'active-r19',
					register_id: 'r19',
					status: 'open',
					opened_at_gmt: '2026-09-17 09:00:00',
					opened_by: 7,
				},
			],
		};
	});
	render(<Closures scope={{ from: '2026-09-17', to: '2026-09-17', storeId: 2, registerId: '' }} />);
	if (retry) {
		await waitFor(() => expect(screen.getByTestId('session-retry-r19')).toBeTruthy());
		fireEvent.click(screen.getByTestId('session-retry-r19'));
	}
	await waitFor(() =>
		expect(screen.getByTestId('remote-session-r19').textContent).toContain('Print X-report')
	);
	expect(
		get.mock.calls.filter(([url]) => url === 'sessions').map(([, config]) => config.params.page)
	).toEqual(retry ? [1, 2, 1, 2] : [1, 2]);
	expect(documentHook).toHaveBeenCalledWith(
		expect.objectContaining({ document: 'xreport:active-r19' })
	);
	expect(get).not.toHaveBeenCalledWith('closures/last', {
		params: { store_id: 2, register_id: 'r19' },
	});
	await waitFor(() => expect(screen.getAllByTestId('reports-session-card')).toHaveLength(20));
});
