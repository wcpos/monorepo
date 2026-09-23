import * as React from 'react';
import { TextInput as RNTextInput, TextInputProps as RNTextInputProps, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';

import { useMergedRef } from '@wcpos/hooks/use-merged-ref';

import { IconButton } from '../icon-button';
import { MAX_FONT_SCALE } from '../lib/scale';
import { cn } from '../lib/utils';

interface InputContextValue {
	isFocused: boolean;
	setIsFocused: (focused: boolean) => void;
}

const InputContext = React.createContext<InputContextValue | undefined>(undefined);

function useInputContext() {
	const context = React.useContext(InputContext);
	if (!context) {
		throw new Error('TextField components must be used within a TextField.Root');
	}
	return context;
}

interface RootProps {
	children: React.ReactNode;
	className?: string;
	disabled?: boolean;
}

function Root({ children, className, disabled = false }: RootProps) {
	const [isFocused, setIsFocused] = React.useState(false);

	return (
		<InputContext.Provider value={{ isFocused, setIsFocused }}>
			<View
				className={cn(
					'border-border bg-card h-ctl w-full flex-row items-center rounded-lg border',
					isFocused && 'border-ring web:ring-1 web:ring-ring',
					disabled && 'web:cursor-not-allowed opacity-45',
					className
				)}
			>
				{children}
			</View>
		</InputContext.Provider>
	);
}

function Left({ children, className }: { children: React.ReactNode; className?: string }) {
	return <View className={cn('justify-center pl-3', className)}>{children}</View>;
}

interface InputFieldProps extends RNTextInputProps {
	ref?: React.Ref<RNTextInput>;
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
	className?: string;
}

function InputField({
	ref,
	className,
	placeholderTextColor,
	type = 'text',
	editable = true,
	// Field type is capped at 1.3x for the same reason `Text` is: a larger OS
	// text size must not break a form row. A caller's prop still wins.
	maxFontSizeMultiplier = MAX_FONT_SCALE,
	...props
}: InputFieldProps) {
	const { setIsFocused } = useInputContext();
	const inputRef = React.useRef<RNTextInput>(null);
	const mergedRef = useMergedRef(ref ?? null, inputRef);

	let keyboardType: RNTextInputProps['keyboardType'] = 'default';
	let inputMode: RNTextInputProps['inputMode'] = 'text';

	switch (type) {
		case 'numeric':
			keyboardType = 'numeric';
			inputMode = 'numeric';
			break;
		case 'email':
			keyboardType = 'email-address';
			inputMode = 'email';
			break;
		case 'phone':
			keyboardType = 'phone-pad';
			inputMode = 'tel';
			break;
		case 'decimal':
			keyboardType = 'decimal-pad';
			inputMode = 'decimal';
			break;
		case 'url':
			keyboardType = 'url';
			inputMode = 'url';
			break;
		case 'ascii':
			keyboardType = 'ascii-capable';
			inputMode = 'text';
			break;
		case 'numbers':
			keyboardType = 'numbers-and-punctuation';
			inputMode = 'numeric';
			break;
		case 'name-phone':
			keyboardType = 'name-phone-pad';
			inputMode = 'text';
			break;
		case 'twitter':
			keyboardType = 'twitter';
			inputMode = 'text';
			break;
		case 'web-search':
			keyboardType = 'web-search';
			inputMode = 'search';
			break;
		default:
			keyboardType = 'default';
			inputMode = 'text';
	}

	/**
	 * Workaround for autoFocus not working reliably on RNTextInput.
	 * Other components (popover, combobox) may steal focus, so we delay the focus call.
	 * Empty dependency array is intentional - run once on mount only.
	 *
	 * @FIXME - Investigate root cause of autoFocus not working and remove this workaround.
	 */
	React.useEffect(() => {
		const timer = setTimeout(() => {
			if (props.autoFocus && inputRef.current) {
				inputRef.current?.focus();
			}
		}, 50);
		return () => clearTimeout(timer);
	}, []);

	return (
		<RNTextInput
			ref={mergedRef}
			editable={editable}
			className={cn(
				'text-foreground placeholder:text-muted-foreground w-full flex-1 bg-transparent px-3 py-2 text-base leading-none outline-none',
				!editable && 'web:cursor-not-allowed opacity-45',
				className
			)}
			// placeholderTextColor={placeholderTextColor || 'text-muted-foreground'}
			keyboardType={keyboardType}
			inputMode={inputMode}
			maxFontSizeMultiplier={maxFontSizeMultiplier}
			{...props}
			onFocus={(e) => {
				setIsFocused(true);
				props.onFocus?.(e);
			}}
			onBlur={(e) => {
				setIsFocused(false);
				props.onBlur?.(e);
			}}
		/>
	);
}

function Right({ children, className }: { children: React.ReactNode; className?: string }) {
	return <View className={cn('justify-center pr-1', className)}>{children}</View>;
}

interface InputProps
	extends Omit<InputFieldProps, 'children'>, Omit<RootProps, 'children' | 'editable'> {
	clearable?: boolean;
	/** testID for the clear (×) button — E2E flows clear a filled field through it. */
	clearTestID?: string;
	defaultValue?: string;
	inputClassName?: string;
}

function Input({
	className,
	inputClassName,
	editable = true,
	disabled = false,
	type,
	clearable = false,
	clearTestID,
	value: valueProp,
	defaultValue,
	onChangeText,
	ref,
	...props
}: InputProps) {
	const [value, setValue] = useControllableState<string>({
		prop: valueProp,
		defaultProp: defaultValue,
		onChange: onChangeText,
	});
	const isDisabled = disabled || !editable;
	const inputRef = React.useRef<RNTextInput>(null);
	const mergedRef = useMergedRef(ref ?? null, inputRef);

	/**
	 * NOTE - we need to trigger the onChange callback if it exists
	 * otherwise the parent component won't know the value has changed
	 */
	const handleClear = () => {
		setValue('');
		if (typeof props?.onChange === 'function') {
			// Web-specific workaround: simulate a change event for parent components
			props.onChange({ target: { value: '' } } as unknown as Parameters<
				NonNullable<RNTextInputProps['onChange']>
			>[0]);
		}
		if (inputRef.current) {
			inputRef.current.focus();
		}
	};

	return (
		<Root className={className} disabled={isDisabled}>
			<InputField
				ref={mergedRef}
				type={type}
				editable={!isDisabled}
				value={value}
				onChangeText={setValue}
				className={inputClassName}
				{...props}
			/>
			{clearable && value !== undefined && value.length > 0 && (
				<Right>
					<IconButton
						name="xmark"
						size="sm"
						onPress={handleClear}
						accessibilityLabel="Clear text"
						testID={clearTestID}
					/>
				</Right>
			)}
		</Root>
	);
}

Input.Root = Root;
Input.Left = Left;
Input.InputField = InputField;
Input.Right = Right;

export { Input };
export type { InputProps };
