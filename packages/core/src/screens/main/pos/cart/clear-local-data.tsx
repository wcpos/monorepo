import * as React from 'react';
import { View } from 'react-native';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { GateScreen } from '@wcpos/components/gate-screen';
import { Portal } from '@wcpos/components/portal';
import { Toast } from '@wcpos/components/toast';
import { clearLocalDataNow, scheduleLocalDataReset } from '@wcpos/query/local-data-reset';
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
	const runtime = useQueryRuntime();
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
		setConfirmingReset(await countUnsentChanges(runtime.engine));
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

		if (scheduleLocalDataReset()) {
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

		// A fallback that works on web, and a refusal with its own toast on native:
		// worth a warn for support, not a red "unexpected error, report it".
		uiLogger.warn('Failed to schedule the pre-hydration reset; falling back to direct clear');

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
			const result = await clearLocalDataNow();
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
					<AlertDialogFooter
						cancel={{ testID: 'clear-all-local-data-cancel' }}
						confirm={{
							destructive: true,
							label: t('common.clear_all_local_data_confirm'),
							testID: 'clear-all-local-data-confirm',
							onPress: () => void handleReset(),
						}}
					/>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/**
 * The freeze after a scheduled reset that cannot restart the app. Mounted once by the
 * drawer layout so it outlives whichever bar or rail hosted the confirm.
 *
 * A gate, opaque: it replaces the register rather than dimming it, because nothing under it
 * may be used. There is no button by design: this build cannot restart itself, and any way
 * back into the register would let a cashier sell into data the next launch destroys. The
 * only way out is closing the app, which the body says.
 */
export function RestartLockOverlay() {
	const t = useT();
	const locked = useRestartLocked();
	if (!locked) return null;
	return (
		<Portal name="clear-local-data-restart-overlay">
			<View testID="clear-local-data-restart-overlay" className="absolute inset-0 z-50">
				<GateScreen
					testID="clear-local-data-restart-gate"
					tone="warning"
					title={t('common.clear_all_local_data_restart_required')}
					description={t('common.clear_all_local_data_restart_required_body')}
				/>
			</View>
		</Portal>
	);
}
