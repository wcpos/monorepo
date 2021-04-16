import * as React from 'react';
import { View } from 'react-native';
// import { Theme, useTheme } from '../../../theme';

export interface SpaceProps {
	/**
	 * Spacing value.
	 */
	// value: Extract<keyof Theme['spacing'], string>;
	value: any;
}

/**
 * Used to add spacing between components.
 */
export const Space: React.FC<SpaceProps> = ({ value }) => {
	// const theme = useTheme();

	// return <View style={{ width: theme.spacing[value], height: theme.spacing[value] }} />;
	return <View />;
};
