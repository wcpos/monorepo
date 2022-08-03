import * as React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
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

const RootError = ({ error, resetErrorBoundary }: FallbackProps) => {
	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.content}>
				<Text style={styles.title}>Oops!</Text>
				<Text style={styles.subtitle}>There's an error</Text>
				<Text style={styles.error}>{error.toString()}</Text>
				<TouchableOpacity style={styles.button} onPress={resetErrorBoundary}>
					<Text style={styles.buttonText}>Try again</Text>
				</TouchableOpacity>
			</View>
		</SafeAreaView>
	);
};

export default RootError;
