import * as React from 'react';
import { View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';

export type CalloutTone = 'destructive' | 'warning';

const TONE_CLASS: Record<CalloutTone, string> = {
	destructive: 'border-destructive',
	warning: 'border-warning',
};

/**
 * Store health callout: a red (or amber) left edge, no box. The content keeps
 * the page's own typography — the edge is the only decoration.
 */
export function Callout({
	tone = 'destructive',
	children,
	testID,
	className,
}: {
	tone?: CalloutTone;
	children: React.ReactNode;
	testID?: string;
	className?: string;
}) {
	return (
		<View testID={testID} className={cn('border-l-[3px] py-1 pl-4', TONE_CLASS[tone], className)}>
			{children}
		</View>
	);
}
