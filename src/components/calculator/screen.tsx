import Calculator from './calculator';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';

const CalculatorScreen = () => (
	<View style={styles.container}>
		<Calculator />
	</View>
);

const styles = StyleSheet.create({
	container: { alignItems: 'center', justifyContent: 'center', flex: 1 },
});
