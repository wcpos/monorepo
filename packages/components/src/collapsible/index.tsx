import * as React from 'react';

import * as CollapsiblePrimitive from './primitives';
import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { TextClassContext } from '../text';

import type { CollapsibleRootProps } from './types';
import type { SlottablePressableProps, SlottableViewProps } from '@rn-primitives/types';

const CollapsibleContent = CollapsiblePrimitive.Content;

function Collapsible({
	className,
	children,
	...props
}: SlottableViewProps & CollapsibleRootProps & { className?: string }) {
	return (
		<CollapsiblePrimitive.Root className={cn('flex-col gap-2', className)} {...props}>
			{children}
		</CollapsiblePrimitive.Root>
	);
}

function CollapsibleTrigger({
	className,
	children,
	...props
}: Omit<SlottablePressableProps, 'children'> & {
	className?: string;
	children?: React.ReactNode;
}) {
	const { open } = CollapsiblePrimitive.useCollapsibleContext(); // Access the open state

	return (
		<TextClassContext.Provider value="">
			<CollapsiblePrimitive.Trigger
				className={cn('flex-row items-center gap-2', className)}
				{...props}
			>
				<>
					{children}
					<Icon name={open ? 'chevronUp' : 'chevronDown'} size="sm" />
				</>
			</CollapsiblePrimitive.Trigger>
		</TextClassContext.Provider>
	);
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
