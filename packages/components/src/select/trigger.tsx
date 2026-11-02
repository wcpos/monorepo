import * as React from 'react';

import * as SelectPrimitive from '@rn-primitives/select';

import { cn } from '../lib/utils';

function Trigger({ className, ...props }: SelectPrimitive.TriggerProps) {
	const { open } = SelectPrimitive.useRootContext();
	return <SelectPrimitive.Trigger {...props} className={cn(className, open && 'border-ring')} />;
}
export { Trigger };
