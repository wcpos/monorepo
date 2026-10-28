import * as React from 'react';
import {
	type GestureResponderEvent,
	Pressable,
	type PressableProps,
	type Role,
} from 'react-native';

import { usePointer } from '../lib/device';
import { hapticPress } from '../lib/haptics';
import { MinTargetBand } from '../lib/min-target';
import { cn } from '../lib/utils';

export type SurfaceRole =
	| 'button'
	| 'option'
	| 'menuitem'
	| 'menuitemradio'
	| 'menuitemcheckbox'
	| 'radio'
	| 'checkbox'
	| 'tab'
	| 'link'
	| 'row';

/** The press wash, and the same wash on a fine-pointer hover, by the ground under the surface. */
const WASH = {
	muted: ['active:bg-muted', 'web:hover:bg-muted'],
	card: ['active:bg-card', 'web:hover:bg-card'],
	destructive: ['active:bg-destructive/10', 'web:hover:bg-destructive/10'],
} as const;
export type SurfaceWash = keyof typeof WASH | 'none';

/** Roles whose `selected` is announced as checked, not selected. */
const CHECKED_ROLES = new Set(['radio', 'checkbox', 'menuitemradio', 'menuitemcheckbox']);
/** react-native-web presses on Space only for the button role; these get it here. */
const SPACE_ROLES = new Set([...CHECKED_ROLES, 'option', 'menuitem', 'tab']);

export type PressableSurfaceProps = Omit<PressableProps, 'role'> & {
	ref?: React.Ref<React.ComponentRef<typeof Pressable>>;
	/** Unset, a surface with an action is a `button`; one without is no control at all. */
	role?: SurfaceRole;
	/** The picked one: announced as checked on a radio or checkbox role, selected otherwise. */
	selected?: boolean;
	/** Dimmed like `disabled` but still pressable, for an option the caller gates. */
	dimmed?: boolean;
	wash?: SurfaceWash;
	/** The light press haptic on native, as every Button gives; opt out per surface. */
	haptic?: boolean;
	/** Drawn under 44 pt: the finger still gets 44 (`lib/min-target`). */
	minTarget?: boolean;
	className?: string;
};

/**
 * The one pressable surface under every row, tile, nav item and button: the role and what it
 * announces, focusability, the press wash and its fine-pointer hover (a coarse pointer keeps a
 * hover after the tap), the one disabled dim, the native haptic and the 44 pt target. The layouts
 * on it keep only their own geometry.
 */
export function PressableSurface(props: PressableSurfaceProps) {
	// Only a surface that paints its own wash reads the pointer for the hover gate.
	return props.wash === 'none' ? <Surface {...props} /> : <WashedSurface {...props} />;
}

function WashedSurface({ wash = 'muted', ...props }: PressableSurfaceProps) {
	const pointer = usePointer();
	const [press, hover] = WASH[wash as keyof typeof WASH];
	return <Surface {...props} washClassName={cn(press, pointer === 'fine' && hover)} />;
}

function Surface({
	role,
	accessibilityRole,
	selected,
	disabled,
	dimmed = false,
	wash: _wash,
	washClassName,
	haptic = true,
	minTarget = false,
	onPress,
	onKeyDown,
	className,
	children,
	...props
}: PressableSurfaceProps & { washClassName?: string }) {
	const named: string | undefined = role ?? accessibilityRole;
	const resolved = named ?? (onPress ? 'button' : undefined);
	const checked = resolved !== undefined && CHECKED_ROLES.has(resolved);
	const press = onPress
		? (event: GestureResponderEvent) => {
				if (haptic && !disabled) hapticPress();
				onPress(event);
			}
		: undefined;
	const band = minTarget && <MinTargetBand />;
	return (
		<Pressable
			role={resolved as Role | undefined}
			// A surface without an action is no tab stop (react-native-web ignores `focusable`).
			tabIndex={onPress || props.onLongPress || named ? undefined : -1}
			// React Native maps both onto the state a native screen reader announces.
			aria-selected={checked ? undefined : selected}
			aria-checked={checked ? selected : undefined}
			{...props}
			// Always a real boolean: an undefined `disabled` after a disabled render latches the
			// Android view at enabled=false (button ledger line 1).
			disabled={!!disabled}
			onPress={press}
			onKeyDown={(event) => {
				onKeyDown?.(event);
				if (
					press &&
					!disabled &&
					SPACE_ROLES.has(resolved ?? '') &&
					event.nativeEvent.key === ' ' &&
					!event.defaultPrevented &&
					event.target === event.currentTarget
				) {
					event.preventDefault();
					press(event as unknown as GestureResponderEvent);
				}
			}}
			className={cn(
				washClassName,
				(disabled || dimmed) && 'opacity-45',
				disabled && 'web:pointer-events-none',
				className
			)}
		>
			{typeof children === 'function' ? (
				(state) => (
					<>
						{children(state)}
						{band}
					</>
				)
			) : (
				<>
					{children}
					{band}
				</>
			)}
		</Pressable>
	);
}
