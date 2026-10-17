import { View } from 'react-native';

import { Badge, type BadgeProps } from './index';

const TONES = [
	'default',
	'destructive',
	'secondary',
	'success',
	'warning',
	'muted',
] as const satisfies readonly NonNullable<BadgeProps['variant']>[];

export const stories = [
	{ id: 'count', render: () => <Badge count={5} /> },
	{ id: 'max', render: () => <Badge count={150} max={99} /> },
	{ id: 'dot', render: () => <Badge dot /> },
	{ id: 'sm', render: () => <Badge count={3} size="sm" variant="destructive" /> },
	{
		id: 'lg',
		render: () => (
			<Badge size="lg" variant="muted">
				Unsynced
			</Badge>
		),
	},
	{ id: 'secondary', render: () => <Badge count={12} variant="secondary" /> },
	// The tinted state label, one story per tone, beside the solid one at the same height,
	// in a row as the callers place it (a column parent stretches a badge).
	...TONES.map((tone) => ({
		id: `tinted-${tone}`,
		render: () => (
			<View className="flex-row items-center gap-2">
				<Badge variant={tone} tinted>
					Ready
				</Badge>
				<Badge variant={tone}>Ready</Badge>
			</View>
		),
	})),
];
