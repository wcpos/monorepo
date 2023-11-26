import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

const Version = ({ largeScreen }) => {
	const theme = useTheme();

	return (
		<Box paddingY="xxSmall" paddingX={largeScreen ? 'none' : 'large'}>
			<Text type="darkestGrey" size="xSmall" align={largeScreen ? 'center' : 'left'}>
				{largeScreen ? 'v 1.3.25' : 'Version 1.3.25'}
			</Text>
		</Box>
	);
};

export default Version;
