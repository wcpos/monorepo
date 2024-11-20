import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { HeaderTitleProps } from '@react-navigation/elements';

import { Text } from '@wcpos/components/src/text';

/**
 * TODO - text trucation doesn't trigger when screen size changes
 */
const HeaderTitle = ({ children }: HeaderTitleProps) => {
	// useWindowDimensions();

	return (
		<Text className="text-primary-foreground text-xl" numberOfLines={1}>
			{children}
		</Text>
	);
};

export default HeaderTitle;
