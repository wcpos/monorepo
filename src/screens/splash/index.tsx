import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import Logo from '@wcpos/components/src/logo';

/**
 * NOTE: the ThemeProvider is not loaded yet, so we can't use any theme related components here
 * @TODO - should we have a timeout and a way to force clear the local DBs if it takes too long?
 */
const Splash = () => {
	return (
		<View
			style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
		>
			<Logo width={150} height={150} />
		</View>
	);
};

export default Splash;
