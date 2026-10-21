import * as React from 'react';

import { fireEvent, render } from '@testing-library/react-native';

import { resetHydration } from '@wcpos/core/contexts/app-state/use-hydration-suspense';

import { RootError } from './root-error';

jest.mock('react-native-safe-area-context', () => ({
	SafeAreaView: jest.requireActual('react-native').View,
}));
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
