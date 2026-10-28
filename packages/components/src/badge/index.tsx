import * as React from 'react';
import { View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { BeatingCount, type CountMotion, useCountBeat } from './count-beat';
import { TONE, type Tone } from '../lib/tone';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

export { BeatingCount, COUNT_MOTION, type CountMotion, useCountBeat } from './count-beat';

const badgeVariants = cva('items-center justify-center rounded-full', {
	variants: {
		size: {
			default: 'h-5 min-w-5 px-1.5',
			sm: 'h-4 min-w-4 px-1',
			lg: 'h-6 min-w-6 px-2',
		},
	},
	defaultVariants: {
		size: 'default',
	},
});

const badgeTextVariants = cva('font-bold tabular-nums', {
	variants: {
		size: {
			default: 'text-xs',
			sm: 'text-2xs',
			lg: 'text-sm',
		},
	},
	defaultVariants: {
		size: 'default',
	},
});

export interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
	/** The state from the tone map; a count with none is `bad`, the notification red. */
	variant?: Tone;
	tinted?: boolean;
	/** The count to display. If 0 or undefined, badge is hidden. */
	count?: number;
	/** Maximum count to display. Shows "99+" if exceeded. Default: 99 */
	max?: number;
	/** Show a dot instead of count */
	dot?: boolean;
	/** Keep a `count` of 0 on show, reading "0", instead of hiding the badge. */
	showZero?: boolean;
	/** How a changed count arrives. Default: `COUNT_MOTION`. */
	motion?: CountMotion;
	/** What is being counted: when it changes, the new count is shown without the beat. */
	identity?: string;
}

/**
 * Badge component for displaying notification counts or indicators.
 *
 * @example
 * // Count badge
 * <Badge count={5} />
 *
 * // Dot indicator
 * <Badge dot />
 *
 * // With max limit
 * <Badge count={150} max={99} /> // Shows "99+"
 *
 * A `count` that changes while the badge is mounted plays the count beat (`useCountBeat`).
 * Keep the badge mounted at 0 (it renders nothing) so that it sees the first count arrive.
 */
export function Badge({
	count,
	children,
	max = 99,
	dot = false,
	showZero = false,
	motion,
	identity,
	variant,
	size,
	tinted,
	className,
	...props
}: BadgeProps) {
	const counted = typeof count === 'number' && (count > 0 || showZero);
	const text = !counted ? null : count > max ? `${max}+` : String(count);
	const beat = useCountBeat({ value: count ?? 0, text, identity, motion });
	const face = TONE[variant ?? 'bad'];
	// A wash keeps its words in the foreground; muted has no wash and stays the solid muted.
	const [ground, ink] =
		tinted && variant !== 'muted' ? [face.tinted, 'text-foreground'] : [face.solid, face.onSolid];

	// Dot mode - just show a small indicator
	if (dot) {
		return <View className={cn(TONE.bad.solid, 'size-2.5 rounded-full', className)} {...props} />;
	}

	// A badge carries its own colour contract, so it resets whatever text classes it is
	// nested inside. A `Button` publishes stateful label colours through `TextClassContext`
	// (`web:group-hover:text-accent-foreground` on the ghost variants); `tailwind-merge`
	// scopes conflicts by modifier, so a prefixed rule never collides with the badge's own
	// unprefixed colour and wins on hover instead — a red badge with dark blue digits (#1369).
	if (children) {
		return (
			<View className={cn(badgeVariants({ size }), ground, className)} {...props}>
				<TextClassContext.Provider value={undefined}>
					{/* One line: a long label (a customer's name in the stilled cart head) truncates
					    inside the badge instead of wrapping out of its fixed height. */}
					<Text className={cn(badgeTextVariants({ size }), ink)} numberOfLines={1}>
						{children}
					</Text>
				</TextClassContext.Provider>
			</View>
		);
	}

	// Don't render if count is 0 or undefined
	if (text === null) return null;

	return (
		<TextClassContext.Provider value={undefined}>
			<BeatingCount
				beat={beat}
				text={text}
				className={cn(badgeVariants({ size }), ground, className)}
				textClassName={cn(badgeTextVariants({ size }), ink)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}
