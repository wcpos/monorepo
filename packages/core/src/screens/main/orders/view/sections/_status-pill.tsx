import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';

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
	'pos-open': 'warning',
	'pos-partial': 'warning',
};

const STATUS_LABEL_KEYS: Record<string, string> = {
	completed: 'orders.status.completed',
	processing: 'orders.status.processing',
	'on-hold': 'orders.status.on-hold',
	pending: 'orders.status.pending',
	refunded: 'orders.status.refunded',
	'partially-refunded': 'orders.status.partially-refunded',
	failed: 'orders.status.failed',
	cancelled: 'orders.status.cancelled',
	trash: 'orders.status.trash',
	'pos-open': 'orders.status.pos-open',
	'pos-partial': 'orders.status.pos-partial',
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
	const t = useT();
	const key = (status || '').toLowerCase();
	const tone = STATUS_TONE[key] ?? 'muted';
	const labelKey = STATUS_LABEL_KEYS[key];
	const label = labelKey
		? t(labelKey)
		: status
			? status.charAt(0).toUpperCase() + status.slice(1)
			: '—';
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
