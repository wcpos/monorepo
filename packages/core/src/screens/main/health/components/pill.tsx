import * as React from 'react';
import { View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';

export type PillTone = 'destructive' | 'warning' | 'muted';

const TONE_CLASS: Record<PillTone, { pill: string; text: string }> = {
	destructive: { pill: 'bg-destructive/10', text: 'text-destructive' },
	warning: { pill: 'bg-warning/10', text: 'text-warning' },
	muted: { pill: 'bg-muted', text: 'text-muted-foreground' },
};

/** Small status pill ("1 stuck") — informational, never a button. */
export function Pill({
	tone = 'destructive',
	children,
	testID,
	className,
}: {
	tone?: PillTone;
	children: React.ReactNode;
	testID?: string;
	className?: string;
}) {
	return (
		<View
			testID={testID}
			className={cn('self-center rounded-full px-2 py-px', TONE_CLASS[tone].pill, className)}
		>
			<Text className={cn('text-[11px] font-semibold', TONE_CLASS[tone].text)}>{children}</Text>
		</View>
	);
}
