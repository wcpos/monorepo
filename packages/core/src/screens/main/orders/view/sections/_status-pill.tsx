import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

type Tone = 'success' | 'warning' | 'destructive' | 'muted';

const STATUS_TONE: Record<string, Tone> = {
	completed: 'success',
	processing: 'success',
	'on-hold': 'warning',
	pending: 'warning',
	refunded: 'destructive',
	'partially-refunded': 'warning',
	failed: 'destructive',
	cancelled: 'muted',
	trash: 'muted',
};

const STATUS_LABEL: Record<string, string> = {
	completed: 'Completed',
	processing: 'Processing',
	'on-hold': 'On hold',
	pending: 'Pending payment',
	refunded: 'Refunded',
	'partially-refunded': 'Partially refunded',
	failed: 'Failed',
	cancelled: 'Cancelled',
	trash: 'Trash',
};

const TONE_CLASSES: Record<Tone, { wrap: string; dot: string; text: string }> = {
	success: {
		wrap: 'bg-success/10 border-success/25',
		dot: 'bg-success',
		text: 'text-success',
	},
	warning: {
		wrap: 'bg-warning/10 border-warning/25',
		dot: 'bg-warning',
		text: 'text-warning',
	},
	destructive: {
		wrap: 'bg-destructive/10 border-destructive/25',
		dot: 'bg-destructive',
		text: 'text-destructive',
	},
	muted: {
		wrap: 'bg-muted border-border',
		dot: 'bg-muted-foreground',
		text: 'text-muted-foreground',
	},
};

export function StatusPill({ status }: { status?: string | null }) {
	const key = (status || '').toLowerCase();
	const tone = STATUS_TONE[key] ?? 'muted';
	const label =
		STATUS_LABEL[key] ?? (status ? status.charAt(0).toUpperCase() + status.slice(1) : '—');
	const classes = TONE_CLASSES[tone];

	return (
		<View
			className={`flex-row items-center gap-1.5 self-center rounded-full border px-2.5 py-0.5 ${classes.wrap}`}
		>
			<View className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />
			<Text className={`text-xs font-medium ${classes.text}`}>{label}</Text>
		</View>
	);
}
