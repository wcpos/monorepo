import * as React from 'react';
import { View } from 'react-native';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Portal } from '@wcpos/components/portal';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { clearAllDB, scheduleClearLocalDataOnNextLoad } from '@wcpos/database';
import { useQueryRuntime } from '@wcpos/query';
import { Platform } from '@wcpos/utils/platform';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { forgetUnsentChanges, type UnsentChanges } from '@wcpos/utils/unsent-changes';

import { useT } from '../../../../contexts/translations';
import { reloadApp } from '../../../../utils/reload-app';
import { countUnsentChanges, describeResetConfirm } from '../../hooks/use-unsent-changes';
import { lockForRestart, useRestartLocked } from './restart-lock';

const uiLogger = getLogger(['wcpos', 'ui', 'menu']);

export function ClearLocalData({ trigger }: { trigger: (onPress: () => void) => React.ReactNode }) {
	const { engine } = useQueryRuntime();
	const t = useT();
	/** Non-null while the reset confirm is open, carrying the reading it must state. */
	const [confirmingReset, setConfirmingReset] = React.useState<UnsentChanges | null>(null);

	/**
	 * Clearing local data destroys the durable mutation queue, so it destroys any
	 * completed sale that never reached the server. Count them first and put the
	 * number in the confirm (#1098) — the same check the root error screen's reset
	 * makes, through the same helper. A count that cannot be taken opens the
	 * confirm anyway with the worst-case warning: refusing would strand a cashier
	 * whose profile is exactly the kind this action exists to repair.
	 */
	const handleResetPress = async () => {
		setConfirmingReset(await countUnsentChanges(engine));
	};

	/**
	 * The databases must never be destroyed under the mounted provider tree:
	 * every open RxDB handle (AppState.userDB included) would keep pointing at
	 * removed storage. So the clear is scheduled as a pre-hydration flag and the
	 * app is reloaded — the next load clears before anything re-opens them.
	 */
	const handleReset = async () => {
		setConfirmingReset(null);
		forgetUnsentChanges();

		if (scheduleClearLocalDataOnNextLoad()) {
			if (reloadApp()) {
				return;
			}
			// Production native cannot restart itself (no expo-updates): the data
			// stays intact until the relaunch, and the overlay keeps it that way.
			// The lock lives outside this component (`restart-lock.ts`) because the
			// trigger's host — a rail, a bar — can unmount before the relaunch.
			lockForRestart();
			return;
		}

		uiLogger.error('Failed to schedule the pre-hydration reset; falling back to direct clear', {
			code: ERROR_CODES.UNEXPECTED_ERROR,
		});

		if (Platform.OS !== 'web') {
			// Without the flag, a direct clear would leave the running app pointing
			// at destroyed databases with no reload to recover it — refuse instead.
			Toast.show({
				type: 'error',
				title: t('common.clear_all_local_data_failed'),
			});
			return;
		}

		// Clear databases to ensure clean start
		try {
			const result = await clearAllDB();
			uiLogger.info(result.message);
		} catch (err) {
			uiLogger.error('Failed to clear database:', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { error: err },
			});
		}

		// Reload the app to reinitialize everything
		reloadApp();
	};

	return (
		<>
			{trigger(() => void handleResetPress())}
			<AlertDialog
				open={confirmingReset !== null}
				onOpenChange={(open: boolean) => {
					if (!open) setConfirmingReset(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('common.clear_all_local_data_title')}</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmingReset ? describeResetConfirm(confirmingReset, t) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel testID="clear-all-local-data-cancel">
							<Text>{t('common.cancel')}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							testID="clear-all-local-data-confirm"
							onPress={() => void handleReset()}
						>
							<Text>{t('common.clear_all_local_data_confirm')}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/**
 * The freeze after a scheduled reset that cannot restart the app. Mounted once by the
 * drawer layout so it outlives whichever bar or rail hosted the confirm.
 */
export function RestartLockOverlay() {
	const t = useT();
	const locked = useRestartLocked();
	if (!locked) return null;
	return (
		<Portal name="clear-local-data-restart-overlay">
			<View
				testID="clear-local-data-restart-overlay"
				className="bg-background/80 absolute inset-0 z-50 items-center justify-center gap-3 p-6"
			>
				<Text className="text-lg font-bold">
					{t('common.clear_all_local_data_restart_required')}
				</Text>
				<Text className="text-center">
					{t('common.clear_all_local_data_restart_required_body')}
				</Text>
			</View>
		</Portal>
	);
}
