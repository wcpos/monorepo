import * as React from 'react';

import * as CheckboxPrimitive from '@rn-primitives/checkbox';
import { Platform, View } from '@rn-primitives/core';
import { mergeProps } from '@rn-primitives/utils';

import { Icon } from '../icon';
import { cn } from '../lib/utils';

const CHECKBOX_NATIVE_PROPS = {
	hitSlop: 10,
};

const Checkbox = ({
	className,
	indeterminate,
	native,
	...props
}: CheckboxPrimitive.RootProps & { indeterminate?: boolean }) => {
	return (
		<CheckboxPrimitive.Root
			className={cn(
				'border-border shrink-0 rounded border disabled:opacity-50',
				Platform.select({
					web: 'ring-offset-background focus-visible:ring-ring size-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed',
					native: 'size-6',
				}),
				className
			)}
			native={mergeProps(CHECKBOX_NATIVE_PROPS, native)}
			{...props}
		>
			{indeterminate ? (
				<View className={cn('bg-primary h-full w-full items-center justify-center rounded')}>
					<Icon name="minus" className="native:size-4 text-primary-foreground size-3" />
				</View>
			) : (
				<CheckboxPrimitive.Indicator
					className={cn('bg-primary h-full w-full items-center justify-center rounded')}
				>
					<Icon name="check" className="native:size-4 text-primary-foreground size-3" />
				</CheckboxPrimitive.Indicator>
			)}
		</CheckboxPrimitive.Root>
	);
};

export { Checkbox };
