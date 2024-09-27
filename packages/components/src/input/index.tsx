import * as React from 'react';
import { TextInput as RNTextInput, TextInputProps as RNTextInputProps, View } from 'react-native';

import { useControllableState } from '@rn-primitives/hooks';

import { IconButton } from '../icon-button';
import { cn } from '../lib/utils';

interface TextFieldContextValue {
	isFocused: boolean;
	setIsFocused: (focused: boolean) => void;
}

const TextFieldContext = React.createContext<TextFieldContextValue | undefined>(undefined);

function useTextFieldContext() {
	const context = React.useContext(TextFieldContext);
	if (!context) {
		throw new Error('TextField components must be used within a TextField.Root');
	}
	return context;
}

interface RootProps {
	children: React.ReactNode;
	className?: string;
	editable?: boolean;
}

const Root = ({ children, className, editable = true }: RootProps) => {
	const [isFocused, setIsFocused] = React.useState(false);

	return (
		<TextFieldContext.Provider value={{ isFocused, setIsFocused }}>
			<View
				className={cn(
					'flex-row flex-1 items-center',
					'h-10 native:h-12 w-full rounded-md border border-input bg-background',
					'px-3 web:py-2',
					'web:ring-offset-background',
					isFocused && 'web:ring-2 web:ring-ring web:ring-offset-1',
					!editable && 'opacity-50 web:cursor-not-allowed',
					className
				)}
			>
				{children}
			</View>
		</TextFieldContext.Provider>
	);
};

Root.displayName = 'InputRoot';

const Left = ({ children, className }: { children: React.ReactNode; className?: string }) => {
	return <View className={cn('mr-2', className)}>{children}</View>;
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
		const { setIsFocused } = useTextFieldContext();

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
				onFocus={(e) => {
					setIsFocused(true);
					props.onFocus?.(e);
				}}
				onBlur={(e) => {
					setIsFocused(false);
					props.onBlur?.(e);
				}}
				className={cn(
					'flex-1',
					'bg-transparent',
					'text-base lg:text-sm native:text-lg native:leading-[1.25] text-foreground placeholder:text-muted-foreground',
					'outline-none',
					'web:focus-visible:outline-none',
					className
				)}
				placeholderTextColor={placeholderTextColor || 'text-muted-foreground'}
				keyboardType={keyboardType}
				inputMode={inputMode}
				{...props}
			/>
		);
	}
);

InputField.displayName = 'InputField';

const Right = ({ children, className }: { children: React.ReactNode; className?: string }) => {
	return <View className={cn('ml-2', className)}>{children}</View>;
};

Right.displayName = 'InputRight';

interface InputProps
	extends Omit<InputFieldProps, 'children' | 'value' | 'defaultValue' | 'onChangeText'>,
		Omit<RootProps, 'children' | 'editable'> {
	editable?: boolean;
	clearable?: boolean;
	value?: string;
	defaultValue?: string;
	onChangeText?: (text: string) => void;
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
			editable = true,
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
			<Root className={className} editable={editable}>
				<InputField
					ref={ref}
					type={type}
					editable={editable}
					value={value}
					onChangeText={setValue}
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
