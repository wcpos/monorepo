/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ClearLocalData, RestartLockOverlay } from './clear-local-data';
import { resetRestartLockForTests } from './restart-lock';

jest.mock('expo-haptics', () => ({}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine: {} }) }));
jest.mock('@wcpos/database', () => ({
	clearAllDB: jest.fn().mockResolvedValue({ success: true, message: 'cleared' }),
	scheduleClearLocalDataOnNextLoad: jest.fn(),
}));
jest.mock('../../../../utils/reload-app', () => ({ reloadApp: jest.fn() }));
jest.mock('@wcpos/utils/platform', () => ({
	Platform: { OS: 'web', isWeb: true, isNative: false, isElectron: false },
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));
function passthrough({ children }: React.PropsWithChildren) {
	return <div>{children}</div>;
}
jest.mock('@wcpos/components/portal', () => ({ Portal: passthrough }));
jest.mock('@wcpos/components/text', () => ({ Text: passthrough }));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? <div>{children}</div> : null,
	AlertDialogAction: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress: () => void; testID: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	AlertDialogCancel: passthrough,
	AlertDialogContent: passthrough,
	AlertDialogDescription: passthrough,
	AlertDialogFooter: passthrough,
	AlertDialogHeader: passthrough,
	AlertDialogTitle: passthrough,
}));
/**
 * The overlay is rendered beside the trigger here the way the drawer layout mounts it in
 * the app: it reads the module-level restart lock, not this component's state, so the
 * freeze survives the trigger's host unmounting (a rail on rotation, a bar on navigation).
 */
const renderReset = () =>
	render(
		<>
			<ClearLocalData
				trigger={(onPress) => (
					<button data-testid="clear-all-local-data" onClick={onPress}>
						Reset
					</button>
				)}
			/>
			<RestartLockOverlay />
		</>
	);
/**
 * "Clear local data" must never destroy the databases under the mounted
 * provider tree without a guaranteed reload: every open RxDB handle (including
 * AppState.userDB) would keep pointing at removed storage. The confirmed reset
 * schedules a pre-hydration clear and reloads; a build that cannot restart
 * itself (production native, no expo-updates) freezes the register behind a
 * restart overlay with the data still intact.
 */
describe('ClearLocalData', () => {
	const { clearAllDB, scheduleClearLocalDataOnNextLoad } = jest.requireMock('@wcpos/database');
	const { reloadApp } = jest.requireMock('../../../../utils/reload-app');
	const { Toast } = jest.requireMock('@wcpos/components/toast');
	const { Platform: mockPlatform } = jest.requireMock('@wcpos/utils/platform');

	const confirmReset = async () => {
		renderReset();
		await act(async () => {
			fireEvent.click(screen.getByTestId('clear-all-local-data'));
		});
		await act(async () => {
			fireEvent.click(screen.getByTestId('clear-all-local-data-confirm'));
		});
	};

	beforeEach(() => {
		resetRestartLockForTests();
		jest.clearAllMocks();
		clearAllDB.mockResolvedValue({ success: true, message: 'cleared' });
		mockPlatform.OS = 'web';
		mockPlatform.isWeb = true;
		mockPlatform.isNative = false;
	});

	it('schedules the pre-hydration clear and reloads without touching the databases', async () => {
		scheduleClearLocalDataOnNextLoad.mockReturnValue(true);
		reloadApp.mockReturnValue(true);

		await confirmReset();

		expect(scheduleClearLocalDataOnNextLoad).toHaveBeenCalled();
		expect(reloadApp).toHaveBeenCalled();
		expect(clearAllDB).not.toHaveBeenCalled();
		expect(Toast.show).not.toHaveBeenCalled();
		expect(screen.queryByTestId('clear-local-data-restart-overlay')).toBeNull();
	});

	it('freezes the register behind a restart overlay when the build cannot reload itself', async () => {
		mockPlatform.OS = 'ios';
		mockPlatform.isWeb = false;
		mockPlatform.isNative = true;
		scheduleClearLocalDataOnNextLoad.mockReturnValue(true);
		reloadApp.mockReturnValue(false);

		await confirmReset();

		expect(screen.getByTestId('clear-local-data-restart-overlay')).toBeTruthy();
		expect(clearAllDB).not.toHaveBeenCalled();
	});

	it('keeps the restart overlay when the confirming host unmounts', async () => {
		mockPlatform.OS = 'ios';
		mockPlatform.isWeb = false;
		mockPlatform.isNative = true;
		scheduleClearLocalDataOnNextLoad.mockReturnValue(true);
		reloadApp.mockReturnValue(false);

		const { rerender } = render(
			<>
				<ClearLocalData
					trigger={(onPress) => (
						<button data-testid="clear-all-local-data" onClick={onPress}>
							Reset
						</button>
					)}
				/>
				<RestartLockOverlay />
			</>
		);
		await act(async () => {
			fireEvent.click(screen.getByTestId('clear-all-local-data'));
		});
		await act(async () => {
			fireEvent.click(screen.getByTestId('clear-all-local-data-confirm'));
		});
		// The rail that hosted the confirm is gone (a breakpoint change); the layout's overlay stays.
		rerender(<RestartLockOverlay />);

		expect(screen.getByTestId('clear-local-data-restart-overlay')).toBeTruthy();
	});

	it('refuses a direct clear on native when the flag cannot be scheduled', async () => {
		mockPlatform.OS = 'ios';
		mockPlatform.isWeb = false;
		mockPlatform.isNative = true;
		scheduleClearLocalDataOnNextLoad.mockReturnValue(false);

		await confirmReset();

		expect(clearAllDB).not.toHaveBeenCalled();
		expect(reloadApp).not.toHaveBeenCalled();
		expect(Toast.show).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'error', title: 'common.clear_all_local_data_failed' })
		);
	});

	it('falls back to a direct clear plus reload on web when the flag cannot be scheduled', async () => {
		scheduleClearLocalDataOnNextLoad.mockReturnValue(false);
		reloadApp.mockReturnValue(true);

		await confirmReset();

		expect(clearAllDB).toHaveBeenCalled();
		expect(reloadApp).toHaveBeenCalled();
	});
});

it('warns of possible unsent sales when the count cannot be taken', async () => {
	renderReset();
	expect(screen.queryByTestId('clear-all-local-data-confirm')).toBeNull();
	await act(async () => {
		fireEvent.click(screen.getByTestId('clear-all-local-data'));
	});
	expect(
		screen.getByText('common.clear_all_local_data_unknown common.clear_all_local_data_body')
	).toBeTruthy();
});
