import * as React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet, ScrollView } from 'react-native';

import { clearAllDB } from '@wcpos/database';
import log from '@wcpos/utils/src/logger';

import type { FallbackProps } from 'react-error-boundary';

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
const RootError = ({ error, resetErrorBoundary }: FallbackProps) => {
	const handleReset = async () => {
		// clear userDB to ensure clean start
		await clearAllDB()
			.then(() => {
				log.info('DB cleared successfully');
			})
			.catch((error) => {
				log.error(error);
			});

		/**
		 * This won't work because createUserDB is called at the start of the app, not in the error boundary
		 * I need to fix this, but in the meantime, we'll just reload the app
		 */
		// resetErrorBoundary();
		if (window && window.location) {
			window.location.reload();
		}
	};

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView>
				<View style={styles.content}>
					<Text style={styles.title}>Oops!</Text>
					<Text style={styles.subtitle}>There's an error</Text>
					<Text style={styles.error}>{error.toString()}</Text>
					<TouchableOpacity style={styles.button} onPress={handleReset}>
						<Text style={styles.buttonText}>Try again</Text>
					</TouchableOpacity>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
};

export default RootError;
