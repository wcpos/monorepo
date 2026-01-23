import * as React from 'react';
import {
	Platform,
	TextInput as RNTextInput,
	TextInputProps as RNTextInputProps,
	View,
} from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';

import useMergedRef from '@wcpos/hooks/use-merged-ref';

import { IconButton } from '../icon-button';
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
					'border-border bg-input web:ring-offset-background h-10 w-full flex-row items-center rounded-md border',
					isFocused && 'web:ring-2 web:ring-ring web:ring-offset-1',
					disabled && 'web:cursor-not-allowed opacity-50',
					className
				)}
			>
				{children}
			</View>
		</InputContext.Provider>
	);
}

function Left({ children, className }: { children: React.ReactNode; className?: string }) {
	return <View className={cn('py-2 pl-2', className)}>{children}</View>;
}

interface InputFieldProps extends RNTextInputProps {
	ref?: React.RefObject<RNTextInput>;
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
	...props
}) {
	const { setIsFocused } = useInputContext();
	const inputRef = React.useRef<RNTextInput>(null);
	const mergedRef = useMergedRef(ref, inputRef);

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
	React.useEffect(
		() => {
			const timer = setTimeout(() => {
				if (props.autoFocus && inputRef.current) {
					inputRef.current?.focus();
				}
			}, 50);
			return () => clearTimeout(timer);
		},
		[] // Intentionally empty - run once on mount
	);

	return (
		<RNTextInput
			ref={mergedRef}
			editable={editable}
			className={cn(
				'text-foreground placeholder:text-muted-foreground web:focus-visible:outline-none w-full flex-1 bg-transparent px-3 py-2 text-base leading-none outline-none',
				!editable && 'web:cursor-not-allowed opacity-50',
				className
			)}
			// placeholderTextColor={placeholderTextColor || 'text-muted-foreground'}
			keyboardType={keyboardType}
			inputMode={inputMode}
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
	return <View className={cn('py-2 pr-2', className)}>{children}</View>;
}

interface InputProps
	extends Omit<InputFieldProps, 'children'>, Omit<RootProps, 'children' | 'editable'> {
	clearable?: boolean;
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
	const mergedRef = useMergedRef(ref, inputRef);

	/**
	 * NOTE - we need to trigger the onChange callback if it exists
	 * otherwise the parent component won't know the value has changed
	 */
	const handleClear = () => {
		setValue('');
		if (typeof props?.onChange === 'function') {
			props.onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
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
