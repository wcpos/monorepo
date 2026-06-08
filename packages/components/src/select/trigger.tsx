import * as React from 'react';

import { Slot } from '@rn-primitives/slot';
import * as SelectPrimitive from '@rn-primitives/select';

import { cn } from '../lib/utils';
import { Text, TextClassContext } from '../text';

import type { SlottableTextProps } from '@rn-primitives/types';

function Value({
	asChild,
	placeholder,
	className,
	...props
}: SlottableTextProps & { placeholder: string }) {
	const { value } = SelectPrimitive.useRootContext();
	const textClass = React.useContext(TextClassContext);
	const Component = asChild ? Slot : Text;

	return (
		<TextClassContext.Provider
			value={cn(textClass, 'text-sm', !value?.value && 'text-muted-foreground', className)}
		>
			<Component {...props}>{value?.label ?? placeholder}</Component>
		</TextClassContext.Provider>
	);
}

export { Trigger } from '@rn-primitives/select';
export { Value };
