import * as React from 'react';
import { TextInput as RNTextInput, TextInputProps as RNTextInputProps, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';

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
	editable?: boolean;
	disabled?: boolean;
}

const Root = ({ children, className, editable = true, disabled = false }: RootProps) => {
	const [isFocused, setIsFocused] = React.useState(false);

	return (
		<InputContext.Provider value={{ isFocused, setIsFocused }}>
			<View
				className={cn(
					'flex-row w-full items-center',
					'h-10 native:h-12 rounded-md border border-input bg-background',
					'web:ring-offset-background',
					isFocused && 'web:ring-2 web:ring-ring web:ring-offset-1',
					(!editable || disabled) && 'opacity-50 web:cursor-not-allowed',
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

		return (
			<RNTextInput
				ref={ref}
				editable={editable}
				className={cn(
					'flex-1 w-full py-2 px-3 bg-transparent',
					'text-base lg:text-sm native:text-lg native:leading-[1.25] text-foreground placeholder:text-muted-foreground',
					'outline-none web:focus-visible:outline-none',
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

		return (
			<Root className={className} editable={editable} disabled={disabled}>
				<InputField
					ref={ref}
					type={type}
					editable={editable}
					value={value}
					onChangeText={setValue}
					className={cn(
						(!editable || disabled) && 'opacity-50 web:cursor-not-allowed',
						inputClassName
					)}
					{...props}
				/>
				{clearable && value !== undefined && value.length > 0 && (
					<Right>
						<IconButton
							name="xmark"
							size="sm"
							onPress={() => setValue('')}
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
