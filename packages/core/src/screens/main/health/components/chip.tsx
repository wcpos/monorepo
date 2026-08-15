import * as React from 'react';
import { Pressable } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

/**
 * Filter chip (preset selector) in the Store health idiom: a quiet outlined
 * pill that fills with the primary tint when selected.
 */
export function Chip({
	on = false,
	onPress,
	children,
	testID,
	className,
}: {
	on?: boolean;
	onPress?: () => void;
	children: React.ReactNode;
	testID?: string;
	className?: string;
}) {
	return (
		<Pressable
			testID={testID}
			accessibilityRole="button"
			accessibilityState={{ selected: on }}
			onPress={onPress}
			className={cn(
				'rounded-full border px-3 py-1',
				on
					? 'border-primary/30 bg-primary/10'
					: 'border-border web:hover:border-muted-foreground/40 bg-transparent',
				className
			)}
		>
			<Text className={cn('text-xs', on ? 'text-primary font-semibold' : 'text-muted-foreground')}>
				{children}
			</Text>
		</Pressable>
	);
}
