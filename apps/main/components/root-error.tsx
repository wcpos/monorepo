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

import { getLogger } from '@wcpos/utils/logger';

import type { FallbackProps } from 'react-error-boundary';

const appLogger = getLogger(['wcpos', 'app', 'error']);
const CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY = 'wcpos.clearLocalDataOnNextLoad';

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
});

/**
 *
 */
export function RootError({ error, resetErrorBoundary }: FallbackProps) {
	const [isResetting, setIsResetting] = React.useState(false);

	const handleReset = async () => {
		if (isResetting) {
			return;
		}

		setIsResetting(true);

		if (Platform.OS === 'web') {
			window.localStorage.setItem(CLEAR_LOCAL_DATA_ON_NEXT_LOAD_KEY, '1');
			reloadApp();
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
				`Failed to clear database: ${err instanceof Error ? err.message : String(err)}`
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
						style={[styles.button, isResetting ? { opacity: 0.5 } : null]}
						onPress={handleReset}
						disabled={isResetting}
					>
						<Text style={styles.buttonText}>{isResetting ? 'Resetting…' : 'Try again'}</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
