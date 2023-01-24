import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useTheme } from 'styled-components/native';

import POSColumns from './columns';
import POSTabs from './tabs';

const POS = ({ navigation, route }) => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();

	return dimensions.width >= theme.screens.small ? <POSColumns /> : <POSTabs />;
};

export default POS;
