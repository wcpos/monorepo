import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';

import { Box } from '../box';
import { Loader } from '../loader';

interface Props {
	loading: boolean;
	style?: StyleProp<ViewStyle>;
}

export const LoadingRow = ({ loading = false, style }: Props) => {
	return (
		<Box className="p-2 h-4" style={style}>
			{loading ? <Loader /> : null}
		</Box>
	);
};
