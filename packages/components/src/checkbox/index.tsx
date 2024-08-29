import * as React from 'react';
import { View } from 'react-native';

import * as CheckboxPrimitive from '@rn-primitives/checkbox';

import { Icon } from '../icon';
import { cn } from '../lib/utils';

type CheckboxProps = React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
	indeterminate?: boolean;
};

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
	({ className, indeterminate, ...props }, ref) => {
		return (
			<CheckboxPrimitive.Root
				ref={ref}
				className={cn(
					'web:peer h-4 w-4 native:h-[20] native:w-[20] shrink-0 rounded-sm native:rounded border border-border',
					'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-1',
					'disabled:cursor-not-allowed disabled:opacity-50',
					props.checked && 'bg-primary',
					indeterminate && 'bg-primary',
					className
				)}
				{...props}
			>
				{indeterminate ? (
					<View className={cn('items-center justify-center h-full w-full')}>
						<Icon name="minus" className="w-3 h-3 text-primary-foreground" />
					</View>
				) : (
					<CheckboxPrimitive.Indicator className={cn('items-center justify-center h-full w-full')}>
						<Icon name="check" className="w-3 h-3 text-primary-foreground" />
					</CheckboxPrimitive.Indicator>
				)}
			</CheckboxPrimitive.Root>
		);
	}
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
