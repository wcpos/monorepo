import * as React from 'react';
import { View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';

/**
 * Coverage bar: green when everything is local, blue while partial. Detail
 * belongs in tooltips/sublines — the bar itself stays quiet.
 */
export function CoverageBar({ percent, className }: { percent: number; className?: string }) {
	const clamped = Math.max(0, Math.min(100, percent));
	return (
		<View className={cn('bg-muted h-1 w-16 overflow-hidden rounded-full', className)}>
			<View
				className={clamped >= 100 ? 'bg-success h-1 rounded-full' : 'bg-primary h-1 rounded-full'}
				style={{ width: `${clamped}%` }}
			/>
		</View>
	);
}
