import * as React from 'react';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { useTheme } from '@wcpos/core/contexts/theme';
import AppInfo from '@wcpos/utils/app-info';

/**
 *
 */
const Version = () => {
	const { screenSize } = useTheme();

	return (
		<Text
			className={cn(
				'text-sidebar-foreground text-3xs p-2 px-4 opacity-50',
				screenSize === 'lg' && 'px-0 text-center'
			)}
		>
			{screenSize === 'lg' ? `v ${AppInfo.version}` : `Version ${AppInfo.version}`}
		</Text>
	);
};

export default Version;
