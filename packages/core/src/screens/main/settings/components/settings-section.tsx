import * as React from 'react';
import { View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

interface SettingsSectionProps {
	title?: string;
	description?: string;
	/** First section on a page has no top divider. */
	first?: boolean;
	children: React.ReactNode;
	testID?: string;
}

/**
 * A titled group of setting rows. Structure comes from whitespace and a small
 * uppercase title — the only rule is a light divider between sections.
 */
export function SettingsSection({
	title,
	description,
	first,
	children,
	testID,
}: SettingsSectionProps) {
	return (
		<View testID={testID} className={cn('gap-1', !first && 'border-border/50 border-t pt-5')}>
			{!!title && (
				<Text className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
					{title}
				</Text>
			)}
			{!!description && <Text className="text-muted-foreground text-xs">{description}</Text>}
			<View className="gap-1 pt-1">{children}</View>
		</View>
	);
}
