import * as React from 'react';

import { Box } from '@wcpos/components/box';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

/**
 *
 */
const Version = ({ largeScreen }) => {
	return (
		<Box className={cn('p-1 px-4', largeScreen && 'px-0')} paddingY="xxSmall">
			<Text
				className={cn('text-3xs text-primary-foreground opacity-50', largeScreen && 'text-center')}
			>
				{largeScreen ? 'v 1.7.10' : 'Version 1.7.10'}
			</Text>
		</Box>
	);
};

export default Version;
