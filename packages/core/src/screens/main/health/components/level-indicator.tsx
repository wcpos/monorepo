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
 * Colored dot + localized label. The label may be omitted where space is
 * tight (phone rows) — there the row's expanded detail carries the meaning,
 * so the dot never has to stand alone.
 */
export function LevelIndicator({
	kind,
	label,
	testID,
}: {
	kind: LevelKind;
	label?: string;
	testID?: string;
}) {
	return (
		<HStack testID={testID} className="items-center gap-1.5">
			<View className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[kind])} />
			{label ? <Text className="text-muted-foreground text-xs">{label}</Text> : null}
		</HStack>
	);
}
