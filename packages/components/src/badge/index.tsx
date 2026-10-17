import * as React from 'react';
import { View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { BeatingCount, type CountMotion, useCountBeat } from './count-beat';
import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

export { BeatingCount, COUNT_MOTION, type CountMotion, useCountBeat } from './count-beat';

const badgeVariants = cva('items-center justify-center rounded-full', {
	variants: {
		variant: {
			default: 'bg-primary',
			destructive: 'bg-destructive',
			secondary: 'bg-secondary',
			success: 'bg-success',
			warning: 'bg-warning',
			muted: 'bg-muted',
		},
		size: {
			default: 'h-5 min-w-5 px-1.5',
			sm: 'h-4 min-w-4 px-1',
			lg: 'h-6 min-w-6 px-2',
		},
		/**
		 * The quiet form of a state label (a printer scan's "Ready", a scan test's "Typing"): a wash
		 * of the tone with the words in the tone, at the solid badge's height. The solid badge is
		 * for counts and states that must be seen at a glance; the tinted one sits in a row beside
		 * the row's own text. Muted has no wash to lighten, so it stays as the solid muted.
		 */
		tinted: { true: '', false: '' },
	},
	compoundVariants: [
		{ tinted: true, variant: 'default', class: 'bg-primary/15' },
		{ tinted: true, variant: 'destructive', class: 'bg-destructive/15' },
		{ tinted: true, variant: 'secondary', class: 'bg-secondary/15' },
		{ tinted: true, variant: 'success', class: 'bg-success/15' },
		{ tinted: true, variant: 'warning', class: 'bg-warning/15' },
	],
	defaultVariants: {
		variant: 'default',
		size: 'default',
		tinted: false,
	},
});

const badgeTextVariants = cva('font-bold tabular-nums', {
	variants: {
		variant: {
			default: 'text-primary-foreground',
			destructive: 'text-destructive-foreground',
			secondary: 'text-secondary-foreground',
			success: 'text-success-foreground',
			warning: 'text-warning-foreground',
			muted: 'text-muted-foreground',
		},
		size: {
			default: 'text-xs',
			sm: 'text-2xs',
			lg: 'text-sm',
		},
		tinted: { true: '', false: '' },
	},
	compoundVariants: [
		{ tinted: true, variant: 'default', class: 'text-primary' },
		{ tinted: true, variant: 'destructive', class: 'text-destructive' },
		{ tinted: true, variant: 'secondary', class: 'text-secondary' },
		{ tinted: true, variant: 'success', class: 'text-success' },
		{ tinted: true, variant: 'warning', class: 'text-warning' },
	],
	defaultVariants: {
		variant: 'default',
		size: 'default',
		tinted: false,
	},
});

export interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
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

	// Dot mode - just show a small indicator
	if (dot) {
		return <View className={cn('bg-destructive size-2.5 rounded-full', className)} {...props} />;
	}

	// A badge carries its own colour contract, so it resets whatever text classes it is
	// nested inside. A `Button` publishes stateful label colours through `TextClassContext`
	// (`web:group-hover:text-accent-foreground` on the ghost variants); `tailwind-merge`
	// scopes conflicts by modifier, so a prefixed rule never collides with the badge's own
	// unprefixed colour and wins on hover instead — a red badge with dark blue digits (#1369).
	if (children) {
		return (
			<View className={cn(badgeVariants({ variant, size, tinted }), className)} {...props}>
				<TextClassContext.Provider value={undefined}>
					{/* One line: a long label (a customer's name in the stilled cart head) truncates
					    inside the badge instead of wrapping out of its fixed height. */}
					<Text className={badgeTextVariants({ variant, size, tinted })} numberOfLines={1}>
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
				className={cn(badgeVariants({ variant, size, tinted }), className)}
				textClassName={badgeTextVariants({ variant, size, tinted })}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}
