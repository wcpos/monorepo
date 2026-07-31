import * as React from 'react';
import { View } from 'react-native';

import { cn } from '@wcpos/components/lib/utils';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

/**
 * Display kind for a log row. Derived, not stored: `action` is a row with an
 * actor, `sync` is the sync domain, the rest are the record's level.
 */
export type LevelKind = 'info' | 'warn' | 'error' | 'action' | 'sync' | 'debug';

const DOT_CLASS: Record<LevelKind, string> = {
	info: 'bg-muted-foreground/40',
	warn: 'bg-warning',
	error: 'bg-destructive',
	action: 'bg-action',
	sync: 'bg-info',
	debug: 'bg-muted-foreground/20',
};

/**
 * Colored dot + localized label. The visible label may be omitted where space
 * is tight (phone rows), but the meaning must never ride on color alone —
 * pass `accessibilityLabel` there so assistive tech still reads the kind.
 */
export function LevelIndicator({
	kind,
	label,
	accessibilityLabel,
	testID,
}: {
	kind: LevelKind;
	label?: string;
	accessibilityLabel?: string;
	testID?: string;
}) {
	return (
		<HStack
			testID={testID}
			accessibilityLabel={label ?? accessibilityLabel}
			className="items-center gap-1.5"
		>
			<View className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[kind])} />
			{label ? <Text className="text-muted-foreground text-xs">{label}</Text> : null}
		</HStack>
	);
}
