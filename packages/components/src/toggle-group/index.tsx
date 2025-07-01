import * as React from 'react';

import * as ToggleGroupPrimitive from '@rn-primitives/toggle-group';
import { VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';
import { toggleTextVariants, toggleVariants } from '../toggle';

import type { ItemProps, RootProps } from '@rn-primitives/toggle-group';

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants> | null>(null);

const ToggleGroup = ({
	className,
	variant,
	size,
	children,
	...props
}: RootProps & VariantProps<typeof toggleVariants>) => {
	const childrenArray = React.Children.toArray(children);

	return (
		<ToggleGroupPrimitive.Root
			className={cn(
				'flex flex-row items-center gap-0',
				'border-border rounded-md border',
				className
			)}
			{...props}
		>
			<ToggleGroupContext.Provider value={{ variant, size }}>
				{childrenArray.map((child, index) => {
					if (!React.isValidElement(child)) return child;

					const isFirstItem = index === 0;
					const isLastItem = index === childrenArray.length - 1;

					return React.cloneElement(child, {
						isFirstItem,
						isLastItem,
					});
				})}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive.Root>
	);
};

function useToggleGroupContext() {
	const context = React.useContext(ToggleGroupContext);
	if (context === null) {
		throw new Error(
			'ToggleGroup compound components cannot be rendered outside the ToggleGroup component'
		);
	}
	return context;
}

const ToggleGroupItem = ({
	className,
	children,
	variant,
	size,
	isFirstItem,
	isLastItem,
	...props
}: ItemProps &
	VariantProps<typeof toggleVariants> & { isFirstItem: boolean; isLastItem: boolean }) => {
	const context = useToggleGroupContext();
	const { value } = ToggleGroupPrimitive.useRootContext();

	return (
		<TextClassContext.Provider
			value={cn(
				toggleTextVariants({ variant, size }),
				ToggleGroupPrimitive.utils.getIsSelected(value, props.value)
					? 'text-accent-foreground'
					: 'web:group-hover:text-muted-foreground'
			)}
		>
			<ToggleGroupPrimitive.Item
				className={cn(
					toggleVariants({
						variant: context.variant || variant,
						size: context.size || size,
					}),
					props.disabled && 'web:pointer-events-none opacity-50',
					ToggleGroupPrimitive.utils.getIsSelected(value, props.value) && 'bg-accent',
					isFirstItem && 'rounded-r-none',
					!isLastItem && 'border-border rounded-none border-r',
					isLastItem && 'rounded-l-none',
					className
				)}
				{...props}
			>
				{children}
			</ToggleGroupPrimitive.Item>
		</TextClassContext.Provider>
	);
};

export { ToggleGroup, ToggleGroupItem };
