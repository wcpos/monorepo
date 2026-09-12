/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createTestT } from '../../../../../jest/translate';
import { ClosureSheet } from './closure-sheet';
const closure = { number: 1, unsynced_count: 2, printed_at: null } as never;
const print = jest.fn(async () => '2026-09-12T10:00:00Z');
jest.mock('./movement-sheet', () => ({
	useSessionReport: () => ({ print, previewProps: {}, isOffline: true }),
}));
jest.mock('../../receipt/receipt-body', () => ({
	ReceiptBody: () => <div data-testid="z-preview" />,
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: jest.requireActual('react-native').View },
	ZoomIn: { duration: () => ({ reduceMotion: () => undefined }) },
	ReduceMotion: { System: 'system' },
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => createTestT() }));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '£', format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePOSOverlaySide: () => 'right' }));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
		disabled,
		loading,
	}: {
		children: React.ReactNode;
		onPress: () => void;
		testID: string;
		disabled?: boolean;
		loading?: boolean;
	}) => (
		<button data-testid={testID} disabled={disabled || loading} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
		secureTextEntry,
	}: {
		value: string;
		onChangeText: (v: string) => void;
		testID: string;
		secureTextEntry?: boolean;
	}) => (
		<input
			type={secureTextEntry ? 'password' : 'text'}
			data-testid={testID}
			value={value}
			onChange={(e) => onChangeText(e.target.value)}
		/>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ testID }: { testID?: string }) => <span data-testid={testID} />,
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <>{children}</> : null,
	DialogContent: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
it('shows figures and dismisses with Done', () => {
	const onDone = jest.fn();
	render(
		<ClosureSheet
			closure={closure}
			counted="463.30"
			expected="480.80"
			blind={false}
			onDone={onDone}
		/>
	);
	expect(screen.getByTestId('closure-counted').textContent).toContain('£463.30');
	expect(screen.getByTestId('closure-expected').textContent).toContain('£480.80');
	expect(screen.getByTestId('closure-variance').textContent).toContain('−£17.50 short');
	fireEvent.click(screen.getByTestId('closure-done'));
	expect(onDone).toHaveBeenCalledTimes(1);
});
it('blind closure hides expected and variance', () => {
	render(
		<ClosureSheet closure={closure} counted="463.30" expected="480.80" blind onDone={jest.fn()} />
	);
	expect(screen.getByTestId('closure-counted')).toBeTruthy();
	expect(screen.queryByTestId('closure-expected')).toBeNull();
	expect(screen.queryByTestId('closure-variance')).toBeNull();
});

it('shows the minted number offline, prints and acknowledges the printed time', async () => {
	render(
		<ClosureSheet
			closure={closure}
			counted="463.30"
			expected="480.80"
			blind={false}
			onDone={jest.fn()}
		/>
	);
	expect(screen.getByTestId('closure-sheet').textContent).toContain('Closure 1 written');
	expect(screen.getByTestId('closure-unsynced')).toBeTruthy();
	fireEvent.click(screen.getByTestId('closure-print'));
	await waitFor(() =>
		expect(screen.getByTestId('closure-printed').textContent).toContain('Printed on')
	);
});
