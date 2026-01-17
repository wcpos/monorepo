import * as React from 'react';
import { View, ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { Text } from '../text';

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
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

const badgeTextVariants = cva('font-semibold', {
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
			sm: 'text-[10px]',
			lg: 'text-sm',
		},
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

export interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
	/** The count to display. If 0 or undefined, badge is hidden. */
	count?: number;
	/** Maximum count to display. Shows "99+" if exceeded. Default: 99 */
	max?: number;
	/** Show a dot instead of count */
	dot?: boolean;
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
 */
export function Badge({
	count,
	max = 99,
	dot = false,
	variant,
	size,
	className,
	...props
}: BadgeProps) {
	// Don't render if count is 0 or undefined (unless dot mode)
	if (!dot && (!count || count <= 0)) {
		return null;
	}

	// Dot mode - just show a small indicator
	if (dot) {
		return <View className={cn('bg-destructive h-2.5 w-2.5 rounded-full', className)} {...props} />;
	}

	const displayCount = count && count > max ? `${max}+` : String(count);

	return (
		<View className={cn(badgeVariants({ variant, size }), className)} {...props}>
			<Text className={badgeTextVariants({ variant, size })}>{displayCount}</Text>
		</View>
	);
}
