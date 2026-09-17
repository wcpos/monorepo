/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { SessionCard } from './session-card';
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
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	useStoreDay: () => ({ timezone: 'UTC' }),
	zoneOptions: () => ({}),
}));
const credentials = of([{ id: 7, display_name: 'Pat' }]);
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ site: { populate$: () => credentials } }),
}));
let session: { opened_at_gmt: string; opened_by: number; status: string } | null;
let blind = false;
const lastClosure = { id: 'c' };
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
	useSessionReport: (closure?: unknown) => ({ print: closure ? reprint : print }),
}));
beforeEach(() => {
	jest.clearAllMocks();
	blind = false;
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
