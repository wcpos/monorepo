import * as React from 'react';
import { View } from 'react-native';

import * as CheckboxPrimitive from '@rn-primitives/checkbox';

import { Icon } from '../icon';
import { MinTargetBand } from '../lib/min-target';
import { cn } from '../lib/utils';

type CheckboxProps = React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
	indeterminate?: boolean;
};

function Checkbox({ className, indeterminate, ...props }: CheckboxProps) {
	return (
		<CheckboxPrimitive.Root
			className={cn(
				'web:peer border-border bg-card size-5 shrink-0 rounded-sm border disabled:cursor-not-allowed disabled:opacity-45',
				(props.checked || indeterminate) && 'bg-primary border-primary',
				className
			)}
			{...props}
		>
			{indeterminate ? (
				<View className={cn('h-full w-full items-center justify-center')}>
					<Icon name="minus" className="text-primary-foreground size-3" />
				</View>
			) : (
				<CheckboxPrimitive.Indicator className={cn('h-full w-full items-center justify-center')}>
					<Icon name="check" className="text-primary-foreground size-3" />
				</CheckboxPrimitive.Indicator>
			)}
			<MinTargetBand square />
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
