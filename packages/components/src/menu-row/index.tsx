import * as React from 'react';
import { Platform, Pressable, type PressableProps, View } from 'react-native';

import * as Haptics from 'expo-haptics';

import { SHEET_ROW_ROLES } from '../dropdown-menu/sheet-context';
import { Icon } from '../icon';
import { usePointer } from '../lib/device';
import { cn } from '../lib/utils';
import { Text, TextClassContext, type TextProps } from '../text';

export type MenuRowProps = Omit<PressableProps, 'children'> & {
	/** Set on every row of a choice list to reserve the leading check slot. */
	choice?: boolean;
	selected?: boolean;
	leading?: React.ReactNode;
	label: React.ReactNode;
	description?: React.ReactNode;
	trailing?: React.ReactNode;
	variant?: 'default' | 'destructive';
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
	className,
	disabled,
	onPress,
	accessibilityState,
	...props
}: MenuRowProps) {
	const pointer = usePointer();
	const destructive = variant === 'destructive';
	return (
		<TextClassContext.Provider
			value={cn('text-base select-none', destructive ? 'text-destructive' : 'text-foreground')}
		>
			<Pressable
				{...props}
				onPress={(event) => {
					if (Platform.OS !== 'web' && !disabled) {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
					}
					onPress?.(event);
				}}
				// RNW only handles Space for button roles; menu rows need the same activation.
				onKeyDown={
					Platform.OS === 'web'
						? (event) => {
								if (event.nativeEvent.key !== ' ') return;
								event.preventDefault();
								if (!disabled && !event.nativeEvent.repeat) {
									(event.currentTarget as unknown as HTMLElement).click();
								}
							}
						: undefined
				}
				accessibilityRole={choice ? 'radio' : 'menuitem'}
				role={choice ? SHEET_ROW_ROLES.radio : 'menuitem'}
				accessibilityState={{
					...accessibilityState,
					disabled: !!disabled,
					checked: choice ? selected : undefined,
				}}
				aria-checked={choice ? selected : undefined}
				disabled={disabled}
				className={cn(
					'web:outline-none web:cursor-default min-h-row w-full flex-row items-center gap-2 rounded-md px-2.5 py-1.5',
					destructive
						? 'web:focus:bg-destructive/10 active:bg-destructive/10'
						: 'web:focus:bg-muted active:bg-muted',
					pointer === 'fine' &&
						(destructive ? 'web:hover:bg-destructive/10' : 'web:hover:bg-muted'),
					disabled && 'web:pointer-events-none opacity-45',
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
							{typeof description === 'string' ? <Text>{description}</Text> : description}
						</TextClassContext.Provider>
					)}
				</View>
				{trailing}
			</Pressable>
		</TextClassContext.Provider>
	);
}

MenuRow.Label = MenuRowLabel;

/** A group break, not a divider after every row (DropdownMenuSeparator's sheet classes). */
export function MenuRowSeparator() {
	return <View role="separator" className="bg-border -mx-2 my-1 h-px" />;
}
