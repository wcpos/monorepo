import * as React from 'react';

import * as ToggleGroupPrimitive from '@rn-primitives/toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { ItemProps, RootProps } from '@rn-primitives/toggle-group';

const toggleVariants = cva(
	'web:group web:inline-flex web:ring-offset-background web:transition-colors web:hover:bg-muted active:bg-muted web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2 items-center justify-center rounded-md',
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				outline:
					'border-input web:hover:bg-accent active:bg-accent active:bg-accent border bg-transparent',
			},
			size: {
				default: 'native:h-12 native:px-[12] h-10 px-3',
				sm: 'native:h-10 native:px-[9] h-9 px-2.5',
				lg: 'native:h-14 native:px-6 h-11 px-5',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

const toggleTextVariants = cva('text-foreground text-sm font-medium', {
	variants: {
		variant: {
			default: '',
			outline: 'web:group-hover:text-accent-foreground web:group-active:text-accent-foreground',
		},
		size: {
			default: '',
			sm: '',
			lg: '',
		},
	},
	defaultVariants: {
		variant: 'default',
		size: 'default',
	},
});

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants> | null>(null);

function ToggleGroup({
	className,
	variant,
	size,
	children,
	...props
}: RootProps & VariantProps<typeof toggleVariants>) {
	const childrenArray = React.Children.toArray(children);

	return (
		<ToggleGroupPrimitive.Root
			className={cn('border-border flex flex-row items-center gap-0 rounded-md border', className)}
			{...props}
		>
			<ToggleGroupContext.Provider value={{ variant, size }}>
				{childrenArray.map((child, index) => {
					if (!React.isValidElement<{ isFirstItem?: boolean; isLastItem?: boolean }>(child))
						return child;

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
}

function useToggleGroupContext() {
	const context = React.useContext(ToggleGroupContext);
	if (context === null) {
		throw new Error(
			'ToggleGroup compound components cannot be rendered outside the ToggleGroup component'
		);
	}
	return context;
}

function ToggleGroupItem({
	className,
	children,
	variant,
	size,
	isFirstItem,
	isLastItem,
	...props
}: ItemProps &
	VariantProps<typeof toggleVariants> & { isFirstItem?: boolean; isLastItem?: boolean }) {
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
}

export { ToggleGroup, ToggleGroupItem };
