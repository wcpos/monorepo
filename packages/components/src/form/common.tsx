import * as React from 'react';
import { Platform, View } from 'react-native';
import type { ViewProps } from 'react-native';

import { Noop } from 'react-hook-form';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { FormItemContext, useFormField } from './context';
import { Label } from '../label';
import { CROSSFADE } from '../lib/motion';
import { cn } from '../lib/utils';
import { Text } from '../text';

import type { TextProps } from '../text';

interface FormFieldFieldProps<T> {
	name: string;
	onBlur: Noop;

	onChange: (...args: any[]) => void;
	value: T | undefined;
	disabled?: boolean;
	ref?: React.Ref<unknown>;
}

type FormItemProps<U> = FormFieldFieldProps<U> & {
	label?: string;
	description?: string;
	customComponent?: React.ElementType<any>;
	type?:
		| 'text'
		| 'numeric'
		| 'email'
		| 'phone'
		| 'decimal'
		| 'url'
		| 'ascii'
		| 'numbers'
		| 'name-phone'
		| 'twitter'
		| 'web-search';
};

/**
 * A label press lands on the control's tab stop: the first enabled focusable inside the wrapper,
 * preferring the one at `tabindex="0"` (a radiogroup's roving stop). Disabled parts never take it.
 */
export function focusFirstControl(ref: React.RefObject<React.ComponentRef<typeof View> | null>) {
	if (Platform.OS !== 'web') return;
	const root = ref.current as unknown as HTMLElement | null;
	const enabled = Array.from(
		root?.querySelectorAll<HTMLElement>(
			'button, [role="combobox"], [role="radio"], [tabindex], input'
		) ?? []
	).filter(
		(node) => !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true'
	);
	(enabled.find((node) => node.getAttribute('tabindex') === '0') ?? enabled[0])?.focus();
}

/** `nativeID` seeds the ids of the item's label, description and message (see `aria.ts`). */
function FormItem({ className, nativeID: itemNativeID, ...props }: ViewProps) {
	const generatedID = React.useId();
	const nativeID = itemNativeID ?? generatedID;
	const labelPress = React.useRef<(() => void) | undefined>(undefined);
	const setLabelPress = React.useCallback((press: (() => void) | undefined) => {
		labelPress.current = press;
	}, []);
	const pressLabel = React.useCallback(() => labelPress.current?.(), []);

	return (
		<FormItemContext.Provider value={{ nativeID, setLabelPress, pressLabel }}>
			<View className={cn('gap-1.5', className)} {...props} />
		</FormItemContext.Provider>
	);
}

function FormLabel({
	className,
	nativeID: _nativeID,
	onPress,
	...props
}: React.ComponentProps<typeof Label>) {
	const { error, formItemNativeID } = useFormField();
	const { pressLabel } = React.useContext(FormItemContext);

	return (
		<Label
			// The label is a press target for the control beside it (focus, toggle): it keeps
			// a little vertical padding for the finger; the horizontal inset is gone.
			className={cn('py-1', error && 'text-bad', className)}
			nativeID={formItemNativeID}
			onPress={onPress ?? pressLabel}
			{...props}
		/>
	);
}

function FormDescription({ className, ...props }: TextProps) {
	const { formDescriptionNativeID } = useFormField();

	return (
		<Text nativeID={formDescriptionNativeID} variant="help" className={className} {...props} />
	);
}

function FormMessage({
	className,
	children,
	...props
}: React.ComponentProps<typeof Animated.Text>) {
	const { error, formMessageNativeID } = useFormField();
	const body = error ? String(error?.message) : children;

	if (!body) {
		return null;
	}

	return (
		<Animated.Text
			entering={FadeInDown}
			exiting={FadeOut.duration(CROSSFADE)}
			nativeID={formMessageNativeID}
			className={cn('text-bad text-sm font-medium', className)}
			{...props}
		>
			{body}
		</Animated.Text>
	);
}

export { FormDescription, FormItem, FormLabel, FormMessage };
export type { FormItemProps };
