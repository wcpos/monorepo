import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import Logo from '@wcpos/components/src/logo';

/**
 *
 */
const Splash = () => {
	console.log('Splash');
	return (
		<View
			style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
		>
			<Logo width={150} height={150} />
		</View>
	);
};

export default Splash;
