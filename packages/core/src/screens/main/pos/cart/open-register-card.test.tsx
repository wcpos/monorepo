/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { OpenRegisterCard } from './open-register-card';

let defaultFloat: string | undefined = '200';
let lastCount: string | undefined = '570.10';
const open = jest.fn(async () => undefined);
const print = jest.fn(async () => undefined);
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({
		binding: { registerId: 'r', registers: [{ id: 'r', default_float: defaultFloat }] },
		lastClosed: { counted: { cash: lastCount } },
		actions: { openSession: open },
		expected: { cash: '155' },
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (v: string) => `£${v}` }),
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
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		onChangeText,
		testID,
		inputClassName: _inputClassName,
		...props
	}: {
		onChangeText: (v: string) => void;
		testID: string;
		inputClassName?: string;
	}) => <input {...props} data-testid={testID} onChange={(e) => onChangeText(e.target.value)} />,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
it('prefills default, selects last count, shows only differing variance, and opens', async () => {
	render(<OpenRegisterCard />);
	expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('200');
	expect(screen.queryByTestId('opening-variance')).toBeNull();
	fireEvent.click(screen.getByTestId('open-register-chip-last'));
	expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('570.10');
	expect(screen.getByTestId('opening-variance')).toBeTruthy();
	fireEvent.click(screen.getByTestId('open-register-button'));
	await waitFor(() =>
		expect(open).toHaveBeenCalledWith({ expectedFloat: '200', countedFloat: '570.10' })
	);
});

jest.mock('@wcpos/components/dialog', () => ({
	Dialog: () => null,
	DialogContent: () => null,
	DialogTitle: () => null,
}));
jest.mock('@wcpos/printer', () => ({ usePrint: () => ({ print }) }));
jest.mock('../../receipt/hooks/use-resolved-printer', () => ({
	useResolvedPrinter: () => ({ resolvedPrinter: null }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));

beforeEach(() => {
	defaultFloat = '200';
	lastCount = '570.10';
});
it('uses a last count that arrives after the local query, without replacing typed input', () => {
	defaultFloat = undefined;
	lastCount = undefined;
	const view = render(<OpenRegisterCard />);
	lastCount = '570.10';
	view.rerender(<OpenRegisterCard />);
	expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('570.10');
	fireEvent.change(screen.getByTestId('open-register-amount'), { target: { value: '600' } });
	defaultFloat = '200';
	view.rerender(<OpenRegisterCard />);
	expect((screen.getByTestId('open-register-amount') as HTMLInputElement).value).toBe('600');
});
