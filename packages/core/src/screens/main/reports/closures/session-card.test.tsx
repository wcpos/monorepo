/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { RemoteSessionCard, SessionCard } from './session-card';
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
		binding: { registerName: 'Front' },
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
it('offers the last closure Reprint when the register is closed', async () => {
	session = null;
	render(<SessionCard />);
	expect(screen.getByTestId('reports-session-card').textContent).toContain('Register closed');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(reprint).toHaveBeenCalledTimes(1));
	expect(print).not.toHaveBeenCalled();
});
// Revert: omit the X-report action, its expected drawer, or print failure feedback.
it('prints the live X-report and reports a failed dispatch', async () => {
	print.mockRejectedValueOnce(new Error('paper'));
	render(<SessionCard />);
	expect(screen.getByTestId('session-expected').textContent).toContain('£155.00');
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() =>
		expect(screen.getByTestId('session-print-error').textContent).toContain('paper')
	);
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

// Revert: ignore the room's already-loaded closure when session history is empty.
it('reprints the latest loaded closure when the closed register has no persisted session history', async () => {
	session = null;
	lastClosure = null;
	const row = require('../../../../services/register-session/__fixtures__/closure-local-row.json');
	render(<SessionCard lastKnownClosure={row} />);
	fireEvent.click(screen.getByTestId('reports-session-print'));
	await waitFor(() => expect(reprint).toHaveBeenCalledTimes(1));
	expect(print).not.toHaveBeenCalled();
});
