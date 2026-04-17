import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { Text } from '../text';

const statusBadgeVariants = cva('items-center justify-center rounded-full px-2 py-0.5', {
	variants: {
		variant: {
			default: 'bg-primary/15',
			success: 'bg-success/15',
			warning: 'bg-warning/15',
			error: 'bg-destructive/15',
			info: 'bg-info/15',
			muted: 'bg-muted',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

const statusBadgeTextVariants = cva('text-[10px] font-semibold', {
	variants: {
		variant: {
			default: 'text-primary',
			success: 'text-success',
			warning: 'text-warning',
			error: 'text-destructive',
			info: 'text-info',
			muted: 'text-muted-foreground',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

export interface StatusBadgeProps extends ViewProps, VariantProps<typeof statusBadgeVariants> {
	/** The text label to display */
	label: string;
}

/**
 * A text-based status badge for displaying states like "Valid", "Expired", "Active", etc.
 *
 * Unlike Badge (which shows notification counts), StatusBadge displays text labels
 * with semantic color variants.
 *
 * @example
 * <StatusBadge label="Valid" variant="success" />
 * <StatusBadge label="Expired" variant="warning" />
 * <StatusBadge label="Error" variant="error" />
 */
export function StatusBadge({ label, variant, className, ...props }: StatusBadgeProps) {
	return (
		<View className={cn(statusBadgeVariants({ variant }), className)} {...props}>
			<Text className={statusBadgeTextVariants({ variant })}>{label}</Text>
		</View>
	);
}
