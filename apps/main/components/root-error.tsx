import * as React from 'react';
import {
	NativeModules,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { scheduleClearLocalDataOnNextLoad } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	forgetUnsentChanges,
	readUnsentChanges,
	type UnsentChanges,
} from '@wcpos/utils/unsent-changes';

import { resetConfirmBody } from './root-error-copy';

import type { FallbackProps } from 'react-error-boundary';

const appLogger = getLogger(['wcpos', 'app', 'error']);

/**
 * Reload the app - handles web and native platforms
 */
const reloadApp = () => {
	if (Platform.OS === 'web') {
		// Web: use window.location.reload()
		window.location.reload();
	} else {
		// Native: use DevSettings.reload() (works in development builds)
		// For production, you would need expo-updates installed
		NativeModules.DevSettings?.reload();
	}
};

/**
 * NOTE: we don't have access to the theme here, so we can't use tailwind
 */
const styles: any = StyleSheet.create({
	container: {
		backgroundColor: '#fafafa',
		flex: 1,
		justifyContent: 'center',
	},
	content: {
		marginHorizontal: 16,
	},
	title: {
		fontSize: 48,
		fontWeight: '300',
		paddingBottom: 16,
		color: '#000',
	},
	subtitle: {
		fontSize: 32,
		fontWeight: '800',
		color: '#000',
	},
	error: {
		paddingVertical: 16,
	},
	button: {
		backgroundColor: '#2196f3',
		borderRadius: 50,
		padding: 16,
	},
	buttonText: {
		color: '#fff',
		fontWeight: '600',
		textAlign: 'center',
	},
	resetButton: {
		marginTop: 8,
		padding: 16,
	},
	resetButtonText: {
		color: '#b3261e',
		fontWeight: '600',
		textAlign: 'center',
	},
	confirm: {
		marginTop: 8,
		backgroundColor: '#fff',
		borderColor: '#b3261e',
		borderRadius: 8,
		borderWidth: 1,
		padding: 16,
	},
	confirmTitle: {
		color: '#b3261e',
		fontSize: 16,
		fontWeight: '700',
		paddingBottom: 8,
	},
	confirmBody: {
		color: '#000',
		paddingBottom: 16,
	},
	confirmActions: {
		flexDirection: 'row',
		gap: 8,
		justifyContent: 'flex-end',
	},
	confirmCancel: {
		padding: 12,
	},
	confirmCancelText: {
		color: '#000',
		fontWeight: '600',
	},
	confirmAction: {
		backgroundColor: '#b3261e',
		borderRadius: 50,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	confirmActionText: {
		color: '#fff',
		fontWeight: '600',
	},
});

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

	const handleTryAgain = () => {
		if (isResetting) return;
		setConfirming(null);
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

		if (Platform.OS === 'web') {
			if (scheduleClearLocalDataOnNextLoad()) {
				reloadApp();
				return;
			}
			appLogger.error('Failed to schedule the pre-hydration reset; falling back to direct clear', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
			});
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

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView>
				<View style={styles.content}>
					<Text style={styles.title}>Oops!</Text>
					<Text style={styles.subtitle}>{"There's an error"}</Text>
					<Text style={styles.error}>{String(error)}</Text>
					<TouchableOpacity
						testID="root-error-try-again"
						style={[styles.button, isResetting ? { opacity: 0.5 } : null]}
						onPress={handleTryAgain}
						disabled={isResetting}
					>
						<Text style={styles.buttonText}>Try again</Text>
					</TouchableOpacity>
					{confirming === null ? (
						<TouchableOpacity
							testID="root-error-reset"
							style={[styles.resetButton, isResetting ? { opacity: 0.5 } : null]}
							onPress={handleResetPress}
							disabled={isResetting}
						>
							<Text style={styles.resetButtonText}>
								{isResetting ? 'Resetting…' : 'Reset app data and restart'}
							</Text>
						</TouchableOpacity>
					) : (
						<View testID="root-error-reset-panel" style={styles.confirm}>
							<Text style={styles.confirmTitle}>Reset app data and restart?</Text>
							<Text testID="root-error-reset-warning" style={styles.confirmBody}>
								{resetConfirmBody(confirming)}
							</Text>
							<View style={styles.confirmActions}>
								<TouchableOpacity
									testID="root-error-reset-cancel"
									style={styles.confirmCancel}
									onPress={() => setConfirming(null)}
								>
									<Text style={styles.confirmCancelText}>Cancel</Text>
								</TouchableOpacity>
								<TouchableOpacity
									testID="root-error-reset-confirm"
									style={styles.confirmAction}
									onPress={() => {
										void handleConfirmReset();
									}}
								>
									<Text style={styles.confirmActionText}>Reset and restart</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
