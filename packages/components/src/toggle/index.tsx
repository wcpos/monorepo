import * as React from 'react';

import * as TogglePrimitive from '@rn-primitives/toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

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

function Toggle({
	className,
	variant,
	size,
	...props
}: TogglePrimitive.RootProps & VariantProps<typeof toggleVariants>) {
	return (
		<TextClassContext.Provider
			value={cn(
				toggleTextVariants({ variant, size }),
				props.pressed ? 'text-accent-foreground' : 'web:group-hover:text-muted-foreground',
				className
			)}
		>
			<TogglePrimitive.Root
				className={cn(
					toggleVariants({ variant, size }),
					props.disabled && 'web:pointer-events-none opacity-50',
					props.pressed && 'bg-accent',
					className
				)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

// function ToggleIcon({
// 	className,
// 	icon: Icon,
// 	...props
// }: React.ComponentPropsWithoutRef<LucideIcon> & {
// 	icon: LucideIcon;
// }) {
// 	const textClass = React.useContext(TextClassContext);
// 	return <Icon className={cn(textClass, className)} {...props} />;
// }

export {
	Toggle,
	//ToggleIcon,
	toggleTextVariants,
	toggleVariants,
};
