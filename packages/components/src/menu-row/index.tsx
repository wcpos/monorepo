import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { PressableSurface, type PressableSurfaceProps } from '../pressable-surface';
import { Text, TextClassContext, type TextProps } from '../text';

export type MenuRowProps = Omit<PressableSurfaceProps, 'children' | 'wash' | 'dimmed' | 'role'> & {
	/** Set on every row of a choice list to reserve the leading check slot. */
	choice?: boolean;
	selected?: boolean;
	leading?: React.ReactNode;
	label: React.ReactNode;
	description?: React.ReactNode;
	trailing?: React.ReactNode;
	variant?: 'default' | 'destructive';
	/**
	 * Dimmed like `disabled` but still pressable, for an option the caller gates (a Free
	 * range whose press shows the Pro hint). The lock icon is the caller's `trailing`.
	 */
	locked?: boolean;
	/** Layout only; the row owns its surface and type. */
	className?: string;
};

function MenuRowLabel({ className, ...props }: TextProps) {
	return <Text {...props} numberOfLines={1} className={cn('min-w-0 flex-1', className)} />;
}

/** One menu action or choice, with no list divider or button surface. */
export function MenuRow({
	choice = false,
	selected = false,
	leading,
	label,
	description,
	trailing,
	variant = 'default',
	locked = false,
	className,
	...props
}: MenuRowProps) {
	const destructive = variant === 'destructive';
	return (
		<TextClassContext.Provider
			value={cn('text-base select-none', destructive ? 'text-destructive' : 'text-foreground')}
		>
			<PressableSurface
				{...props}
				role={choice ? 'radio' : 'button'}
				selected={choice ? selected : undefined}
				dimmed={locked}
				wash={destructive ? 'destructive' : 'muted'}
				className={cn(
					'web:outline-none web:cursor-default min-h-row w-full flex-row items-center gap-2 rounded-md px-2.5 py-1.5',
					destructive ? 'web:focus:bg-destructive/10' : 'web:focus:bg-muted',
					className
				)}
			>
				{choice && (
					<View aria-hidden className="w-5 items-center">
						{selected && <Icon name="check" size="sm" />}
					</View>
				)}
				{leading}
				<View className="min-w-0 flex-1">
					{typeof label === 'string' || typeof label === 'number' ? (
						<MenuRowLabel>{label}</MenuRowLabel>
					) : (
						label
					)}
					{description != null && (
						<TextClassContext.Provider value="text-muted-foreground text-sm">
							{typeof description === 'string' || typeof description === 'number' ? (
								<Text>{description}</Text>
							) : (
								description
							)}
						</TextClassContext.Provider>
					)}
				</View>
				{trailing}
			</PressableSurface>
		</TextClassContext.Provider>
	);
}

MenuRow.Label = MenuRowLabel;

/** Semantics only: callers still own selection and layout. */
export function MenuRowGroup(props: React.ComponentProps<typeof View>) {
	return <View {...props} role="radiogroup" accessibilityRole="radiogroup" />;
}

/** A group break, not a divider after every row (DropdownMenuSeparator's sheet classes). */
export function MenuRowSeparator() {
	return <View role="separator" className="bg-border -mx-2 my-1 h-px" />;
}
