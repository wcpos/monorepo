import * as React from 'react';

import { Box } from '@wcpos/tailwind/src/box';
import { Text } from '@wcpos/tailwind/src/text';

/**
 *
 */
const Version = ({ largeScreen }) => {
	return (
		<Box
			className={`p-1 px-${largeScreen ? '0' : '4'} justify-${largeScreen ? 'center' : 'left'}`}
			paddingY="xxSmall"
		>
			<Text className="text-3xs text-primary-foreground opacity-50">
				{largeScreen ? 'v 1.6.3' : 'Version 1.6.3'}
			</Text>
		</Box>
	);
};

export default Version;
