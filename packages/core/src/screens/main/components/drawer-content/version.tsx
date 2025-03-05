import * as React from 'react';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

/**
 *
 */
const Version = ({ largeScreen }) => {
	return (
		<Text
			className={cn(
				'text-3xs text-primary-foreground p-2 px-4 opacity-50',
				largeScreen && 'px-0 text-center'
			)}
		>
			{largeScreen ? 'v 2.0.0' : 'Version 2.0.0'}
		</Text>
	);
};

export default Version;
