import * as React from 'react';
import { Platform } from 'react-native';

import { resetHydration } from '@wcpos/core/contexts/app-state/use-hydration-suspense';
import { reloadApp } from '@wcpos/core/utils/reload-app';
import { scheduleClearLocalDataOnNextLoad } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { PreThemeGate, PreThemeParagraph } from '@wcpos/components/gate-screen/pre-theme';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	forgetUnsentChanges,
	readUnsentChanges,
	type UnsentChanges,
} from '@wcpos/utils/unsent-changes';

import { ROOT_ERROR_COPY as COPY, resetConfirmBody } from './root-error-copy';

import type { FallbackProps } from 'react-error-boundary';

const appLogger = getLogger(['wcpos', 'app', 'error']);

/**
 * The last-resort screen: it renders above every provider, which is why it can
 * render at all when the app is broken — and why it has no theme, no
 * translations, and no engine to ask anything.
 *
 * Two actions, and the difference between them matters (#1098). "Try again" is
 * the obvious one, so it is the harmless one: it remounts the tree and touches
 * no data. Until this change it ran `clearAllDB()`, which deletes every local
 * database including the durable mutation queue — so a cashier who tapped the
 * only button on a crash screen destroyed completed sales that existed nowhere
 * else, with nothing said about it.
 *
 * Wiping is still available one step down, under a label that says what it does
 * and a confirm that states how much unsent work it would destroy. The count
 * comes from the reading the running app recorded (see
 * `@wcpos/utils/unsent-changes`); when there is none the confirm warns that the
 * wipe MAY destroy unsent sales and still offers it, because a profile too
 * broken to count is exactly the profile this action exists to recover.
 */
export function RootError({ error, resetErrorBoundary }: FallbackProps) {
	const [isResetting, setIsResetting] = React.useState(false);
	/** Non-null while the reset confirm is showing, carrying the reading it states. */
	const [confirming, setConfirming] = React.useState<UnsentChanges | null>(null);
	/**
	 * True once the wipe is scheduled on a build that cannot restart itself
	 * (production native, no expo-updates). Terminal: both buttons disappear,
	 * because "Try again" could remount a working app whose new sales the
	 * armed pre-hydration clear would silently destroy at the next launch.
	 */
	const [restartRequired, setRestartRequired] = React.useState(false);
	/** Set when the reset could not even be scheduled; the buttons stay usable. */
	const [resetFailed, setResetFailed] = React.useState(false);

	const handleTryAgain = () => {
		if (isResetting) return;
		setConfirming(null);
		// "Try again" re-runs hydration only if hydration was what failed.
		resetHydration();
		resetErrorBoundary();
	};

	const handleResetPress = () => {
		if (isResetting) return;
		// Synchronous and total: whatever the app last recorded, or `unknown`.
		// Nothing here may await a database that might never open.
		setConfirming(readUnsentChanges());
	};

	const handleConfirmReset = async () => {
		if (isResetting) {
			return;
		}

		setIsResetting(true);
		setConfirming(null);
		forgetUnsentChanges();

		if (scheduleClearLocalDataOnNextLoad()) {
			if (reloadApp()) {
				return;
			}
			// Production native cannot restart itself (no expo-updates): the data
			// stays intact until the relaunch, which clears it before hydration.
			setRestartRequired(true);
			setIsResetting(false);
			return;
		}

		appLogger.error('Failed to schedule the pre-hydration reset; falling back to direct clear', {
			code: ERROR_CODES.UNEXPECTED_ERROR,
		});

		if (Platform.OS !== 'web') {
			// Without the flag, a direct clear would strand the running app on
			// destroyed databases with no reload to recover it — refuse instead.
			setResetFailed(true);
			setIsResetting(false);
			return;
		}

		try {
			const { clearAllDB } = await import('@wcpos/database/clear-all-db');
			const result = await clearAllDB();
			if (result && typeof result === 'object' && 'message' in result) {
				appLogger.info(String(result.message));
			}
		} catch (err) {
			appLogger.error(
				`Failed to clear database: ${err instanceof Error ? err.message : String(err)}`,
				{ code: ERROR_CODES.UNEXPECTED_ERROR }
			);
		}

		// Reload the app to reinitialize everything
		reloadApp();
	};

	if (restartRequired) {
		return (
			<PreThemeGate
				testID="root-error-restart-required"
				tone="warning"
				title={COPY.restartTitle}
				description={COPY.restartLine}
			/>
		);
	}

	if (confirming !== null) {
		return (
			<PreThemeGate
				testID="root-error-reset-panel"
				tone="bad"
				title={COPY.confirmTitle}
				primary={{
					label: COPY.confirm,
					testID: 'root-error-reset-confirm',
					// Confirming a loss: the one filled red control (CODING_STANDARDS § Buttons).
					destructive: true,
					onPress: () => {
						void handleConfirmReset();
					},
				}}
				secondary={{
					label: COPY.cancel,
					testID: 'root-error-reset-cancel',
					onPress: () => setConfirming(null),
				}}
			>
				<PreThemeParagraph testID="root-error-reset-warning">
					{resetConfirmBody(confirming)}
				</PreThemeParagraph>
			</PreThemeGate>
		);
	}

	return (
		<PreThemeGate
			testID="root-error"
			tone="bad"
			title={COPY.crashTitle}
			description={COPY.crashLine}
			detail={String(error)}
			primary={{
				label: COPY.tryAgain,
				testID: 'root-error-try-again',
				onPress: handleTryAgain,
				disabled: isResetting,
			}}
			secondary={{
				label: isResetting ? COPY.resetting : COPY.reset,
				testID: 'root-error-reset',
				onPress: handleResetPress,
				disabled: isResetting,
			}}
		>
			{resetFailed ? (
				<PreThemeParagraph testID="root-error-reset-failed">{COPY.resetFailed}</PreThemeParagraph>
			) : null}
		</PreThemeGate>
	);
}
