import * as React from 'react';
import { Platform } from 'react-native';

import { reloadApp } from '@wcpos/core/utils/reload-app';
import {
	readClearLocalDataOnNextLoadFlag,
	unscheduleClearLocalDataOnNextLoad,
} from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { PreThemeGate } from './pre-theme-gate';

const appLogger = getLogger(['wcpos', 'app', 'startup']);

export type ClearLocalDataStartupState = 'idle' | 'clearing' | 'blocked';

/**
 * Runs the scheduled pre-hydration clear and reports whether hydration may
 * proceed. 'blocked' is the fail-closed answer: the clear failed (possibly
 * part-way through the databases) or the armed flag could not be proven gone
 * afterwards — hydrating in either state would let the marker's retry on a
 * later launch destroy everything sold in between, so nothing may open the
 * databases until a relaunch retries the clear.
 */
export async function performScheduledClear(): Promise<'done' | 'blocked'> {
	try {
		// Lazy call-time require (not a static import): the clear module must not
		// load — its native variant builds Directory handles at module scope —
		// unless a clear is actually scheduled. Not `await import()`: jest-expo's
		// VM cannot execute real dynamic import.
		const { clearAllDB } =
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			require('@wcpos/database/clear-all-db') as typeof import('@wcpos/database/clear-all-db');
		const result = await clearAllDB();
		unscheduleClearLocalDataOnNextLoad();

		if (result && typeof result === 'object' && 'message' in result) {
			appLogger.info(String(result.message));
		}

		if (readClearLocalDataOnNextLoadFlag() !== 'not-scheduled') {
			appLogger.error('The reset flag survived the clear; refusing to hydrate', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
			});
			return 'blocked';
		}

		return 'done';
	} catch (error) {
		appLogger.error('Failed to clear local data before hydration', {
			code: ERROR_CODES.UNEXPECTED_ERROR,
			context: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return 'blocked';
	}
}

export function useClearLocalDataOnStartup(): ClearLocalDataStartupState {
	const [state, setState] = React.useState<ClearLocalDataStartupState>(() => {
		const flag = readClearLocalDataOnNextLoadFlag();
		if (flag === 'scheduled') return 'clearing';
		// 'unknown' (native filesystem error): an armed marker may be hiding
		// behind the failure — fail closed rather than trade toward a wipe.
		if (flag === 'unknown') return 'blocked';
		return 'idle';
	});

	React.useEffect(() => {
		if (state !== 'clearing') {
			return;
		}

		let cancelled = false;

		void (async () => {
			const outcome = await performScheduledClear();
			if (cancelled) {
				return;
			}
			if (outcome === 'blocked') {
				setState('blocked');
				return;
			}
			if (Platform.OS === 'web') {
				window.location.reload();
				return;
			}
			// Native has no page to reload, and none is needed: the layout renders
			// null while this runs, so nothing has opened the databases yet and
			// hydration starts fresh against the cleared state.
			setState('idle');
		})();

		return () => {
			cancelled = true;
		};
	}, [state]);

	return state;
}

/**
 * Rendered above every provider (like the root error screen), so no theme and
 * no translations: a `PreThemeGate`. It must never offer a way back into the
 * app: the register only becomes safe again once a relaunch finishes the
 * clear. Web's one action reloads, which retries the clear before hydration.
 */
export function ClearLocalDataBlockedScreen() {
	const web = Platform.OS === 'web';
	return (
		<PreThemeGate
			testID="clear-local-data-blocked"
			tone="warn"
			title="Reset didn’t finish"
			description={
				web
					? 'The local data reset did not complete. Reload the page to retry — nothing new can be saved until it finishes.'
					: 'The local data reset did not complete. Close the app completely and open it again to retry — nothing new can be saved until it finishes.'
			}
			primary={
				web
					? {
							label: 'Reload and retry',
							testID: 'clear-local-data-blocked-retry',
							onPress: () => {
								reloadApp();
							},
						}
					: undefined
			}
		/>
	);
}
