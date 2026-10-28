import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { TONE } from '../lib/tone';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

// The dot carries the status colour and the word stays in the foreground, so a
// status reads at arm's length in every theme and never by colour alone
// (design rule 5). The tinted filled pill this replaced is removal R3
// (wcpos/roadmap#351): there is no shape prop and no pill variant.
const statusDotVariants = cva('shrink-0 rounded-full', {
	variants: {
		// `caption` is a row's state line and a log level: the help rank's muted words.
		size: { default: 'size-2', caption: 'size-1.5' },
		variant: {
			default: 'bg-primary',
			ok: TONE.ok.dot,
			warning: TONE.warning.dot,
			bad: TONE.bad.dot,
			info: TONE.info.dot,
			muted: TONE.muted.dot,
		},
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
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
 * <StatusBadge label="Signed in" variant="ok" />
 * <StatusBadge label="Sign in again" variant="warning" />
 * <StatusBadge label="Out of stock" variant="bad" />
 */
export function StatusBadge({ label, variant, size, className, ...props }: StatusBadgeProps) {
	const caption = size === 'caption';
	return (
		<View className={cn('flex-row items-center gap-1.5', className)} {...props}>
			<View aria-hidden className={statusDotVariants({ variant, size })} />
			{/* Same colour-contract reset as `Badge` — see the note there (#1369). */}
			<TextClassContext.Provider value={undefined}>
				<Text variant={caption ? 'help' : undefined} className={caption ? undefined : 'text-sm'}>
					{label}
				</Text>
			</TextClassContext.Provider>
		</View>
	);
}
