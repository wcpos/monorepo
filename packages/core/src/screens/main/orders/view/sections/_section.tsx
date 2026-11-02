import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

/**
 * Document-style section with a hairline rule below.
 * Compose multiple `Section`s vertically to get a single document
 * with hairlines between them — like the redesigned Stripe-style
 * order view modal.
 */
export function Section({
	title,
	right,
	children,
	className,
	last,
}: {
	title?: React.ReactNode;
	right?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	last?: boolean;
}) {
	return (
		<View className={`px-4 py-4 ${last ? '' : 'border-border border-b'} ${className ?? ''}`}>
			{title ? (
				<View className="mb-3 flex-row items-baseline justify-between">
					{typeof title === 'string' ? <Text variant="section">{title}</Text> : title}
					{right}
				</View>
			) : null}
			{children}
		</View>
	);
}
