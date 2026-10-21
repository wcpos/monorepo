import * as React from 'react';

import { fireEvent, render } from '@testing-library/react-native';

import { resetHydration } from '@wcpos/core/contexts/app-state/use-hydration-suspense';

import { RootError } from './root-error';

type MockAction = {
	label: string;
	onPress(): void;
	testID: string;
	disabled?: boolean;
	destructive?: boolean;
};
// PreThemeGate's drawing is covered in packages/components; this stand-in shows the props
// RootError chooses: the gate's testID, its children, and each action's slot and fill.
jest.mock('@wcpos/components/gate-screen/pre-theme', () => {
	const { View, Text, Pressable } = jest.requireActual('react-native');
	function Slot({ action }: { action?: MockAction }) {
		if (!action) return null;
		return (
			<Pressable testID={action.testID} disabled={action.disabled} onPress={action.onPress}>
				<Text>{action.label}</Text>
				<Text testID={`${action.testID}-fill`}>
					{action.destructive ? 'destructive' : 'default'}
				</Text>
			</Pressable>
		);
	}
	return {
		PreThemeGate: (props: {
			testID: string;
			children?: React.ReactNode;
			primary?: MockAction;
			secondary?: MockAction;
		}) => (
			<View testID={props.testID}>
				{props.children}
				<Slot action={props.primary} />
				<Slot action={props.secondary} />
			</View>
		),
		PreThemeParagraph: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
			<Text testID={testID}>{children}</Text>
		),
	};
});
jest.mock('@wcpos/core/contexts/app-state/use-hydration-suspense', () => ({
	resetHydration: jest.fn(),
}));
jest.mock('@wcpos/core/utils/reload-app', () => ({ reloadApp: jest.fn() }));
jest.mock('@wcpos/database', () => ({ scheduleClearLocalDataOnNextLoad: jest.fn() }));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ info: jest.fn(), error: jest.fn() }),
}));
jest.mock('@wcpos/utils/unsent-changes', () => ({
	forgetUnsentChanges: jest.fn(),
	readUnsentChanges: jest.fn(),
}));

it('Try again resets hydration before resetting the boundary', async () => {
	const resetErrorBoundary = jest.fn();
	const screen = await render(
		<RootError error={new Error('boom')} resetErrorBoundary={resetErrorBoundary} />
	);

	await fireEvent.press(screen.getByTestId('root-error-try-again'));

	expect(resetHydration).toHaveBeenCalledTimes(1);
	expect(resetErrorBoundary).toHaveBeenCalledTimes(1);
	expect(jest.mocked(resetHydration).mock.invocationCallOrder[0]).toBeLessThan(
		resetErrorBoundary.mock.invocationCallOrder[0]
	);
});

describe('reset', () => {
	const { readUnsentChanges } = jest.requireMock('@wcpos/utils/unsent-changes');
	const { scheduleClearLocalDataOnNextLoad } = jest.requireMock('@wcpos/database');
	const { reloadApp } = jest.requireMock('@wcpos/core/utils/reload-app');

	beforeEach(() => {
		jest.clearAllMocks();
		readUnsentChanges.mockReturnValue({ status: 'some', count: 2 });
	});

	it('confirms with the unsent count before anything is cleared, and Cancel goes back', async () => {
		const screen = await render(
			<RootError error={new Error('boom')} resetErrorBoundary={jest.fn()} />
		);
		await fireEvent.press(screen.getByTestId('root-error-reset'));

		expect(screen.getByTestId('root-error-reset-warning').props.children).toContain('2 changes');
		// Confirming a loss: the primary is the destructive one, Cancel is not.
		expect(screen.getByTestId('root-error-reset-confirm-fill').props.children).toBe('destructive');
		expect(screen.getByTestId('root-error-reset-cancel-fill').props.children).toBe('default');
		expect(scheduleClearLocalDataOnNextLoad).not.toHaveBeenCalled();

		await fireEvent.press(screen.getByTestId('root-error-reset-cancel'));
		expect(screen.queryByTestId('root-error-reset-panel')).toBeNull();
		expect(screen.getByTestId('root-error-try-again')).toBeTruthy();
	});

	it('ends on a restart-required gate with no way back when the build cannot reload', async () => {
		scheduleClearLocalDataOnNextLoad.mockReturnValue(true);
		reloadApp.mockReturnValue(false);
		const screen = await render(
			<RootError error={new Error('boom')} resetErrorBoundary={jest.fn()} />
		);
		await fireEvent.press(screen.getByTestId('root-error-reset'));
		await fireEvent.press(screen.getByTestId('root-error-reset-confirm'));

		expect(screen.getByTestId('root-error-restart-required')).toBeTruthy();
		expect(screen.queryByTestId('root-error-try-again')).toBeNull();
		expect(screen.queryByTestId('root-error-reset')).toBeNull();
	});
});
