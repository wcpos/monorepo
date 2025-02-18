import * as React from 'react';

import * as CollapsiblePrimitive from './primitives';
import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

const CollapsibleContent = CollapsiblePrimitive.Content;

const Collapsible = React.forwardRef<
	React.ElementRef<typeof CollapsiblePrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Root>
>(({ className, children, ...props }, ref) => (
	<CollapsiblePrimitive.Root ref={ref} className={cn('flex-col gap-2', className)} {...props}>
		{children}
	</CollapsiblePrimitive.Root>
));

const CollapsibleTrigger = React.forwardRef<
	React.ElementRef<typeof CollapsiblePrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
	const { open } = CollapsiblePrimitive.useCollapsibleContext(); // Access the open state

	return (
		<TextClassContext.Provider value="">
			<CollapsiblePrimitive.Trigger
				ref={ref}
				className={cn('flex-row items-center gap-2', className)}
				{...props}
			>
				{children}
				<Icon name={open ? 'chevronUp' : 'chevronDown'} size="sm" />
			</CollapsiblePrimitive.Trigger>
		</TextClassContext.Provider>
	);
});
CollapsibleTrigger.displayName = CollapsiblePrimitive.Trigger.displayName;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
