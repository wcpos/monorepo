import * as React from 'react';
import { Pressable } from 'react-native';

import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { Platform } from '@wcpos/utils/platform';

type Props = {
	icon?: (props: { focused?: boolean }) => React.ReactNode;
	label: string;
	focused?: boolean;
	onPress: () => void;
	testID?: string;
};
export function DrawerItem({ icon, label, focused, onPress, testID }: Props) {
	const button = (
		<Pressable
			testID={testID}
			accessibilityRole="button"
			accessibilityLabel={label}
			hitSlop={4}
			onPress={onPress}
			className={`active:bg-card size-12 items-center justify-center rounded-lg ${focused ? 'bg-card' : ''}`}
		>
			{icon?.({ focused })}
		</Pressable>
	);
	// Only wrap with tooltip on web
	if (Platform.OS === 'web')
		return (
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent side="right">
					<Text>{label}</Text>
				</TooltipContent>
			</Tooltip>
		);
	return button;
}
