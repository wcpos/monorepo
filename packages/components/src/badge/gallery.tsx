import { View } from 'react-native';

import { Badge } from './index';

const TONES = ['bad', 'ok', 'warning', 'muted'] as const;

export const stories = [
	{ id: 'count', render: () => <Badge count={5} /> },
	{ id: 'max', render: () => <Badge count={150} max={99} /> },
	{ id: 'dot', render: () => <Badge dot /> },
	{ id: 'sm', render: () => <Badge count={3} size="sm" variant="bad" /> },
	{
		id: 'lg',
		render: () => (
			<Badge size="lg" variant="muted">
				Unsynced
			</Badge>
		),
	},
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
