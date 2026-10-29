import * as React from 'react';
import { View, ViewProps } from 'react-native';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text/context';

// The inset is the card's job, not each caller's: `row` for a device or list row card (12),
// `body` for a card's body (16, the gutter table's "inside a surface").
const paddings = { none: '', row: 'p-3', body: 'p-4' } as const;

function Card({
	padding = 'none',
	className,
	...props
}: ViewProps & { padding?: keyof typeof paddings }) {
	return (
		<View
			className={cn('border-border bg-card rounded-lg border', paddings[padding], className)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: ViewProps) {
	return (
		<TextClassContext.Provider value="text-card-foreground">
			<View className={cn('p-4 pt-0', className)} {...props} />
		</TextClassContext.Provider>
	);
}

export { Card, CardContent };
