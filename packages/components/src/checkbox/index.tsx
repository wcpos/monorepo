import * as React from 'react';
import { View } from 'react-native';

import * as CheckboxPrimitive from '@rn-primitives/checkbox';

import { Icon } from '../icon';
import { cn } from '../lib/utils';

type CheckboxProps = React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
	indeterminate?: boolean;
};

function Checkbox({ className, indeterminate, ...props }: CheckboxProps) {
	return (
		<CheckboxPrimitive.Root
			className={cn(
				'web:peer native:h-[20] native:w-[20] native:rounded',
				'border-border h-4 w-4 shrink-0 rounded-sm border',
				'web:ring-offset-background web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-1',
				'disabled:cursor-not-allowed disabled:opacity-50',
				props.checked && 'bg-primary',
				indeterminate && 'bg-primary',
				className
			)}
			{...props}
		>
			{indeterminate ? (
				<View className={cn('h-full w-full items-center justify-center')}>
					<Icon name="minus" className="text-primary-foreground h-3 w-3" />
				</View>
			) : (
				<CheckboxPrimitive.Indicator className={cn('h-full w-full items-center justify-center')}>
					<Icon name="check" className="text-primary-foreground h-3 w-3" />
				</CheckboxPrimitive.Indicator>
			)}
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
