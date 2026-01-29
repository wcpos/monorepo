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

import { clearAllDB } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';

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
});

/**
 *
 */
export const RootError = ({ error, resetErrorBoundary }: FallbackProps) => {
	const handleReset = async () => {
		// Clear databases to ensure clean start
		try {
			const result = await clearAllDB();
			appLogger.info(result.message);
		} catch (err) {
			appLogger.error('Failed to clear database:', err);
		}

		// Reload the app to reinitialize everything
		reloadApp();
	};

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView>
				<View style={styles.content}>
					<Text style={styles.title}>Oops!</Text>
					<Text style={styles.subtitle}>There&apos;s an error</Text>
					<Text style={styles.error}>{error.toString()}</Text>
					<TouchableOpacity style={styles.button} onPress={handleReset}>
						<Text style={styles.buttonText}>Try again</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
};
