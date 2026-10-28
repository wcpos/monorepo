import * as React from 'react';
import { View } from 'react-native';

import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { PressableSurface, type PressableSurfaceProps } from '../pressable-surface';
import { Text, TextClassContext, type TextProps } from '../text';

export type MenuRowProps = Omit<PressableSurfaceProps, 'children' | 'wash' | 'dimmed'> & {
	/** Set on every row of a choice list to reserve the leading check slot. */
	choice?: boolean;
	/** A row that toggles: the leading slot is a box, marked when `selected`. */
	checkbox?: boolean;
	selected?: boolean;
	/** A primitive's own element around the row presses it (the web select's option): the row only draws. */
	hosted?: boolean;
	leading?: React.ReactNode;
	/** One line of text, or a node; a row of free parts (an icon and a Text) is `children` instead. */
	label?: React.ReactNode;
	description?: React.ReactNode;
	trailing?: React.ReactNode;
	children?: React.ReactNode;
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

/** The item row of every menu, select and sheet; the primitives supply only press and `role`. */
export function MenuRow({
	choice = false,
	checkbox = false,
	selected = false,
	role,
	hosted = false,
	leading,
	label,
	description,
	trailing,
	children,
	variant = 'default',
	locked = false,
	className,
	...props
}: MenuRowProps) {
	const destructive = variant === 'destructive';
	const Surface = hosted ? HostedRow : PressableSurface;
	return (
		<TextClassContext.Provider
			value={cn('text-base select-none', destructive ? 'text-destructive' : 'text-foreground')}
		>
			<Surface
				{...props}
				role={role ?? (checkbox ? 'checkbox' : choice ? 'radio' : 'button')}
				selected={choice || checkbox || role === 'option' ? selected : undefined}
				dimmed={locked}
				wash={destructive ? 'destructive' : 'muted'}
				className={cn(
					'web:outline-none web:cursor-default min-h-row w-full flex-row items-center gap-2 rounded-md px-2.5 py-1.5',
					destructive ? 'web:focus:bg-destructive/10' : 'web:focus:bg-muted',
					className
				)}
			>
				{(choice || checkbox) && (
					<View
						aria-hidden
						className={cn('w-5 items-center', checkbox && BOX[selected ? 'on' : 'off'])}
					>
						{selected && <Icon name="check" size="sm" className={cn(checkbox && BOX_CHECK)} />}
					</View>
				)}
				{leading}
				{children ?? (
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
				)}
				{trailing}
			</Surface>
		</TextClassContext.Provider>
	);
}

const BOX = {
	off: 'border-border bg-card size-5 justify-center rounded-sm border',
	on: 'border-primary bg-primary size-5 justify-center rounded-sm border',
};
const BOX_CHECK = 'text-primary-foreground size-3';

function HostedRow({ className, disabled, dimmed, children }: PressableSurfaceProps) {
	return (
		<View className={cn(className, (disabled || dimmed) && 'opacity-45')}>
			{children as React.ReactNode}
		</View>
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
