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
