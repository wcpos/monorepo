import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

// The dot carries the status colour and the word stays in the foreground, so a
// status reads at arm's length in every theme and never by colour alone
// (design rule 5). The tinted filled pill this replaced is removal R3
// (wcpos/roadmap#351): there is no shape prop and no pill variant.
const statusDotVariants = cva('size-2 shrink-0 rounded-full', {
	variants: {
		variant: {
			default: 'bg-primary',
			success: 'bg-success',
			warning: 'bg-warning',
			error: 'bg-destructive',
			info: 'bg-info',
			muted: 'bg-muted-foreground',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

export interface StatusBadgeProps extends ViewProps, VariantProps<typeof statusDotVariants> {
	/** The text label to display */
	label: string;
}

/**
 * A status as a coloured dot and a word: "Signed in", "Sign in again", "3 users".
 *
 * Unlike Badge (which shows notification counts), StatusBadge names a state with a
 * semantic colour on the dot; the word keeps the foreground colour.
 *
 * @example
 * <StatusBadge label="Signed in" variant="success" />
 * <StatusBadge label="Sign in again" variant="warning" />
 * <StatusBadge label="Out of stock" variant="error" />
 */
export function StatusBadge({ label, variant, className, ...props }: StatusBadgeProps) {
	return (
		<View className={cn('flex-row items-center gap-1.5', className)} {...props}>
			<View aria-hidden className={statusDotVariants({ variant })} />
			{/* Same colour-contract reset as `Badge` — see the note there (#1369). */}
			<TextClassContext.Provider value={undefined}>
				<Text className="text-foreground text-sm">{label}</Text>
			</TextClassContext.Provider>
		</View>
	);
}
