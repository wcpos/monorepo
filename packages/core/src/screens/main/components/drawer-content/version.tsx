import * as React from 'react';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { useTheme } from '@wcpos/core/contexts/theme';

/**
 *
 */
const Version = () => {
	const { screenSize } = useTheme();

	return (
		<Text
			className={cn(
				'text-3xs text-primary-foreground p-2 px-4 opacity-50',
				screenSize === 'lg' && 'px-0 text-center'
			)}
		>
			{screenSize === 'lg' ? 'v 1.8.0' : 'Version 1.8.0'}
		</Text>
	);
};

export default Version;
