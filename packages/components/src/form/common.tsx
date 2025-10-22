import * as React from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

import { Noop } from 'react-hook-form';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { FormItemContext, useFormField } from './context';
import { Label } from '../label';
import { cn } from '../lib/utils';
import { Text } from '../text';

import type { TextProps } from '../text';

interface FormFieldFieldProps<T> {
	name: string;
	onBlur: Noop;
	onChange: (val: T) => void;
	value: T;
	disabled?: boolean;
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

function FormItem({ className, ...props }: ViewProps) {
	const nativeID = React.useId();

	return (
		<FormItemContext.Provider value={{ nativeID }}>
			<View className={cn('gap-1', className)} {...props} />
		</FormItemContext.Provider>
	);
}

function FormLabel({
	className,
	nativeID: _nativeID,
	...props
}: React.ComponentProps<typeof Label>) {
	const { error, formItemNativeID } = useFormField();

	return (
		<Label
			className={cn('p-1', error && 'text-destructive', className)}
			nativeID={formItemNativeID}
			{...props}
		/>
	);
}

function FormDescription({ className, ...props }: TextProps) {
	const { formDescriptionNativeID } = useFormField();

	return (
		<Text
			nativeID={formDescriptionNativeID}
			className={cn('text-muted-foreground pt-1 text-sm', className)}
			{...props}
		/>
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
			exiting={FadeOut.duration(275)}
			nativeID={formMessageNativeID}
			className={cn('text-destructive text-sm font-medium', className)}
			{...props}
		>
			{body}
		</Animated.Text>
	);
}

export { FormDescription, FormItem, FormLabel, FormMessage };
export type { FormItemProps };
