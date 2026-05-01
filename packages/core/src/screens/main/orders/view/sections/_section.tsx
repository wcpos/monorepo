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
		<View
			className={`px-5 py-4 md:px-6 md:py-5 ${last ? '' : 'border-border border-b'} ${className ?? ''}`}
		>
			{title ? (
				<View className="mb-3 flex-row items-baseline justify-between">
					{typeof title === 'string' ? (
						<Text className="text-foreground text-sm font-semibold">{title}</Text>
					) : (
						title
					)}
					{right}
				</View>
			) : null}
			{children}
		</View>
	);
}

/**
 * Compact rail-style section used in the right column.
 * Smaller padding and an uppercase muted heading.
 */
export function RailSection({
	title,
	children,
	className,
	last,
}: {
	title?: string;
	children: React.ReactNode;
	className?: string;
	last?: boolean;
}) {
	return (
		<View
			className={`px-4 py-3 md:px-5 md:py-4 ${last ? '' : 'border-border border-b'} ${className ?? ''}`}
		>
			{title ? (
				<Text className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
					{title}
				</Text>
			) : null}
			{children}
		</View>
	);
}
