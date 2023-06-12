import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const WarningMessage = ({ children }) => {
	return (
		<View>
			<View style={styles.container}>
				<Text style={styles.text}>{children}</Text>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		backgroundColor: 'orange',
		padding: 10,
		margin: 10,
		borderRadius: 5,
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	text: {
		color: 'white',
		fontSize: 16,
	},
	dismissButton: {
		backgroundColor: 'white',
		padding: 5,
		borderRadius: 3,
	},
	buttonText: {
		color: 'black',
		fontSize: 14,
	},
});

export default WarningMessage;
