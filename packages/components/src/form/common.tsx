import * as React from 'react';
import { View } from 'react-native';

import { Noop } from 'react-hook-form';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { FormItemContext, useFormField } from './context';
import { Label } from '../label';
import { cn } from '../lib/utils';
import { Text } from '../text';

interface FormFieldFieldProps<T> {
	name: string;
	onBlur: Noop;
	onChange: (val: T) => void;
	value: T;
	disabled?: boolean;
}

type Override<T, U> = Omit<T, keyof U> & U;

type FormItemProps<T extends React.ElementType<any>, U> = Override<
	React.ComponentPropsWithoutRef<T>,
	FormFieldFieldProps<U>
> & {
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

const FormItem = React.forwardRef<
	React.ElementRef<typeof View>,
	React.ComponentPropsWithoutRef<typeof View>
>(({ className, ...props }, ref) => {
	const nativeID = React.useId();

	return (
		<FormItemContext.Provider value={{ nativeID }}>
			<View ref={ref} className={cn('space-y-1', className)} {...props} />
		</FormItemContext.Provider>
	);
});
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<
	React.ElementRef<typeof Label>,
	Omit<React.ComponentPropsWithoutRef<typeof Label>, 'children'> & {
		children: string;
	}
>(({ className, nativeID: _nativeID, ...props }, ref) => {
	const { error, formItemNativeID } = useFormField();

	return (
		<Label
			ref={ref}
			className={cn('pb-1 native:pb-2 px-px', error && 'text-destructive', className)}
			nativeID={formItemNativeID}
			{...props}
		/>
	);
});
FormLabel.displayName = 'FormLabel';

const FormDescription = React.forwardRef<
	React.ElementRef<typeof Text>,
	React.ComponentPropsWithoutRef<typeof Text>
>(({ className, ...props }, ref) => {
	const { formDescriptionNativeID } = useFormField();

	return (
		<Text
			ref={ref}
			nativeID={formDescriptionNativeID}
			className={cn('text-sm text-muted-foreground pt-1', className)}
			{...props}
		/>
	);
});
FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef<
	React.ElementRef<typeof Animated.Text>,
	React.ComponentPropsWithoutRef<typeof Animated.Text>
>(({ className, children, ...props }, ref) => {
	const { error, formMessageNativeID } = useFormField();
	const body = error ? String(error?.message) : children;

	if (!body) {
		return null;
	}

	return (
		<Animated.Text
			entering={FadeInDown}
			exiting={FadeOut.duration(275)}
			ref={ref}
			nativeID={formMessageNativeID}
			className={cn('text-sm font-medium text-destructive', className)}
			{...props}
		>
			{body}
		</Animated.Text>
	);
});
FormMessage.displayName = 'FormMessage';

export { FormItem, FormLabel, FormDescription, FormMessage, type FormItemProps };
