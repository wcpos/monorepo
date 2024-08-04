import * as React from 'react';
import { TextInput, TextInputProps } from 'react-native';

import { cn } from '../lib/utils';

interface InputProps extends React.ComponentPropsWithoutRef<typeof TextInput> {
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
}

const Input = React.forwardRef<React.ElementRef<typeof TextInput>, InputProps>(
	({ className, placeholderClassName, type = 'text', ...props }, ref) => {
		let keyboardType: TextInputProps['keyboardType'] = 'default';
		let inputMode: TextInputProps['inputMode'] = 'text';

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
			<TextInput
				ref={ref}
				className={cn(
					'web:flex h-10 native:h-12 web:w-full rounded-md border border-input bg-background px-3 web:py-2 text-base lg:text-sm native:text-lg native:leading-[1.25] text-foreground placeholder:text-muted-foreground web:ring-offset-background file:border-0 file:bg-transparent file:font-medium web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2',
					props.editable === false && 'opacity-50 web:cursor-not-allowed',
					className
				)}
				placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
				keyboardType={keyboardType}
				inputMode={inputMode}
				{...props}
			/>
		);
	}
);

Input.displayName = 'Input';

export { Input };
