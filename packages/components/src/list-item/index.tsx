import * as React from 'react';
import { Pressable, type PressableProps, View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { Text } from '../text';

/**
 * ListItem — a selectable row with leading content, title, and trailing content.
 *
 * Composable pattern: pass `leading`, `trailing`, and children for the center content,
 * or use the convenience props `title` and `subtitle`.
 *
 * @example
 * // Basic usage with convenience props
 * <ListItem
 *   leading={<Avatar fallback="PK" variant="success" size="md" />}
 *   title="Paul Kilmurray"
 *   subtitle="Administrator"
 *   trailing={<StatusBadge label="Valid" variant="success" />}
 *   selected
 *   removable
 *   onRemove={() => {}}
 * />
 *
 * // Custom content
 * <ListItem onPress={handlePress}>
 *   <Text>Custom content here</Text>
 * </ListItem>
 */
const listItemVariants = cva('flex-row items-center gap-3 rounded-lg border p-3', {
	variants: {
		variant: {
			default: 'border-border bg-background',
			selected: 'border-primary bg-primary/10',
			warning: 'border-warning/40 bg-warning/10',
			dashed: 'border-border border-dashed',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

export interface ListItemProps
	extends Omit<PressableProps, 'children'>, VariantProps<typeof listItemVariants> {
	/** Content rendered on the left (avatar, icon, etc.) */
	leading?: React.ReactNode;
	/** Primary text label */
	title?: string;
	/** Secondary text label */
	subtitle?: string;
	/** Content rendered on the right before the remove button (badge, etc.) */
	trailing?: React.ReactNode;
	/** Whether this item is in a selected state */
	selected?: boolean;
	/** Whether to show a remove (X) button */
	removable?: boolean;
	/** Called when the remove button is pressed */
	onRemove?: () => void;
	/** Custom children — if provided, replaces title/subtitle */
	children?: React.ReactNode;
}

export function ListItem({
	leading,
	title,
	subtitle,
	trailing,
	selected,
	removable,
	onRemove,
	variant,
	className,
	children,
	...pressableProps
}: ListItemProps) {
	// Explicit non-default variant (e.g. "warning") wins over selected.
	const resolvedVariant =
		variant && variant !== 'default' ? variant : selected ? 'selected' : 'default';

	return (
		<Pressable
			className={cn(listItemVariants({ variant: resolvedVariant }), className)}
			{...pressableProps}
		>
			{leading}

			<View className="flex-1 gap-0.5">
				{children ?? (
					<>
						{title && <Text className="text-sm leading-tight font-medium">{title}</Text>}
						{subtitle && (
							<Text className="text-muted-foreground text-xs leading-tight">{subtitle}</Text>
						)}
					</>
				)}
			</View>

			{trailing}

			{removable && (
				<IconButton
					name="xmark"
					size="xs"
					variant="destructive"
					onPress={(e) => {
						e.stopPropagation();
						onRemove?.();
					}}
				/>
			)}
		</Pressable>
	);
}
