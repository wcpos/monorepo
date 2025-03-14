import * as React from 'react';
import { TextInput as RNTextInput, TextInputProps as RNTextInputProps, View } from 'react-native';

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

const Root = ({ children, className, disabled = false }: RootProps) => {
	const [isFocused, setIsFocused] = React.useState(false);

	return (
		<InputContext.Provider value={{ isFocused, setIsFocused }}>
			<View
				className={cn(
					'w-full flex-row items-center',
					'native:h-12 border-input bg-background h-10 rounded-md border',
					'web:ring-offset-background',
					isFocused && 'web:ring-2 web:ring-ring web:ring-offset-1',
					disabled && 'web:cursor-not-allowed opacity-50',
					className
				)}
			>
				{children}
			</View>
		</InputContext.Provider>
	);
};

Root.displayName = 'InputRoot';

const Left = ({ children, className }: { children: React.ReactNode; className?: string }) => {
	return <View className={cn('py-2 pl-2', className)}>{children}</View>;
};

Left.displayName = 'InputLeft';

interface InputFieldProps extends RNTextInputProps {
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

const InputField = React.forwardRef<RNTextInput, InputFieldProps>(
	({ className, placeholderTextColor, type = 'text', editable = true, ...props }, ref) => {
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
		 * @FIXME - for some reason, I can never get autoFocus to work on the RNTextInput
		 * It's possible that other components are stealing the focus, eg: popover for combobox and number input
		 * For now, we'll just do a delay
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
			[
				// run once on mount
			]
		);

		return (
			<RNTextInput
				ref={mergedRef}
				editable={editable}
				className={cn(
					'w-full flex-1 bg-transparent px-3 py-2',
					'text-foreground placeholder:text-muted-foreground text-base',
					'web:focus-visible:outline-none outline-none',
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
);

InputField.displayName = 'InputField';

const Right = ({ children, className }: { children: React.ReactNode; className?: string }) => {
	return <View className={cn('py-2 pr-2', className)}>{children}</View>;
};

Right.displayName = 'InputRight';

interface InputProps
	extends Omit<InputFieldProps, 'children'>,
		Omit<RootProps, 'children' | 'editable'> {
	clearable?: boolean;
	defaultValue?: string;
	inputClassName?: string;
}

interface InputComponent
	extends React.ForwardRefExoticComponent<InputProps & React.RefAttributes<RNTextInput>> {
	Root: typeof Root;
	Left: typeof Left;
	InputField: typeof InputField;
	Right: typeof Right;
}

const Input = React.forwardRef<RNTextInput, InputProps>(
	(
		{
			className,
			inputClassName,
			editable = true,
			disabled = false,
			type,
			clearable = false,
			value: valueProp,
			defaultValue,
			onChangeText,
			...props
		},
		ref
	) => {
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
) as InputComponent;

Input.displayName = 'Input';

Input.Root = Root;
Input.Left = Left;
Input.InputField = InputField;
Input.Right = Right;

export { Input };
export type { InputProps };
