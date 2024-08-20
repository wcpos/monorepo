import * as React from 'react';

import { Box } from '@wcpos/tailwind/src/box';
import { cn } from '@wcpos/tailwind/src/lib/utils';
import { Text } from '@wcpos/tailwind/src/text';

/**
 *
 */
const Version = ({ largeScreen }) => {
	return (
		<Box className={cn('p-1 px-4', largeScreen && 'px-0')} paddingY="xxSmall">
			<Text
				className={cn('text-3xs text-primary-foreground opacity-50', largeScreen && 'text-center')}
			>
				{largeScreen ? 'v 1.6.3' : 'Version 1.6.3'}
			</Text>
		</Box>
	);
};

export default Version;
