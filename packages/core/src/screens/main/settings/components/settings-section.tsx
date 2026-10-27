import * as React from 'react';
import { View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { SectionHeading } from '@wcpos/components/section-heading';

interface SettingsSectionProps {
	title?: string;
	description?: string;
	/** First section on a page has no top divider. */
	first?: boolean;
	children: React.ReactNode;
	testID?: string;
}

/**
 * A titled group of setting rows: the ladder's section heading, and a hairline rule between
 * sections with 16 above and below it. The pages stack sections in a `gap-5` (20) VStack, so a
 * later section pulls up 4 (`-mt-1`) to sit its rule 16 under the last row, then pads 16 to its
 * heading (`pt-4`).
 */
export function SettingsSection({
	title,
	description,
	first,
	children,
	testID,
}: SettingsSectionProps) {
	return (
		<View
			testID={testID}
			className={cn('gap-1', !first && 'border-border border-t-hairline -mt-1 pt-4')}
		>
			{!!title && <SectionHeading title={title} description={description} />}
			<View className="gap-1 pt-1">{children}</View>
		</View>
	);
}
