import * as React from 'react';
import { View } from 'react-native';

import { cva, type VariantProps } from 'class-variance-authority';

import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';
import { PressableSurface, type PressableSurfaceProps } from '../pressable-surface';
import { Text } from '../text';
import { TILE_SURFACE } from '../lib/tile-surface';

/**
 * ListItem — a selectable row with leading content, title, and trailing content.
 *
 * Composable pattern: pass `leading`, `trailing`, and children for the center content,
 * or use the convenience props `title` and `subtitle`.
 *
 * @example
 * // Basic usage with convenience props
 * <ListItem
 *   leading={<Avatar fallback="PK" size="md" />}
 *   title="Paul Kilmurray"
 *   subtitle="Administrator"
 *   trailing={<StatusBadge label="Valid" variant="ok" />}
 *   selected
 *   removable
 *   removeLabel="Remove Paul Kilmurray"
 *   onRemove={() => {}}
 * />
 *
 * // Custom content
 * <ListItem onPress={handlePress}>
 *   <Text>Custom content here</Text>
 * </ListItem>
 */
// A tile laid out as a row: the tile's surface and its picked state (`lib/tile-surface.ts`).
const listItemVariants = cva(
	`min-h-row flex-row items-center gap-3 px-3 py-2 ${TILE_SURFACE.base}`,
	{
		variants: {
			variant: {
				default: TILE_SURFACE.rest,
				selected: TILE_SURFACE.selected,
				warning: 'border-warning/40 bg-warning/10',
				dashed: TILE_SURFACE.dashed,
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	}
);

interface ListItemBaseProps
	extends
		Omit<PressableSurfaceProps, 'children' | 'wash' | 'dimmed'>,
		VariantProps<typeof listItemVariants> {
	/** Content rendered on the left (avatar, icon, etc.) */
	leading?: React.ReactNode;
	/** Primary text label */
	title?: string;
	/** Secondary text label */
	subtitle?: string;
	/** Content rendered on the right before the remove button (badge, etc.) */
	trailing?: React.ReactNode;
	/** Called when the remove button is pressed */
	onRemove?: () => void;
	/** Custom children — if provided, replaces title/subtitle */
	children?: React.ReactNode;
}

// The remove (X) is icon-only, so a removable row must say what removing it does: the caller
// passes the translated name, and TypeScript refuses a removable row without one.
type ListItemRemoveProps =
	| { removable?: false; removeLabel?: undefined }
	| {
			/** Whether to show a remove (X) button */
			removable: true;
			/** The remove button's accessible name, translated by the caller. */
			removeLabel: string;
	  };

export type ListItemProps = ListItemBaseProps & ListItemRemoveProps;

export function ListItem({
	leading,
	title,
	subtitle,
	trailing,
	selected,
	removable,
	removeLabel,
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
		<PressableSurface
			selected={selected}
			className={cn(listItemVariants({ variant: resolvedVariant }), className)}
			{...pressableProps}
		>
			{leading}

			<View className="flex-1 gap-0.5">
				{children ?? (
					<>
						{title && (
							<Text variant="subheading" className="leading-tight">
								{title}
							</Text>
						)}
						{subtitle && (
							<Text variant="key" className="leading-tight">
								{subtitle}
							</Text>
						)}
					</>
				)}
			</View>

			{trailing}

			{removable && (
				<IconButton
					name="close"
					size="xs"
					variant="destructive"
					accessibilityLabel={removeLabel}
					// A disabled row cannot be removed either (CodeRabbit on #2213).
					disabled={pressableProps.disabled ?? undefined}
					onPress={(e) => {
						e.stopPropagation();
						onRemove?.();
					}}
				/>
			)}
		</PressableSurface>
	);
}
