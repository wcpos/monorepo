import * as React from 'react';

import * as SelectPrimitive from '@rn-primitives/select';
import { Slot } from '@rn-primitives/slot';

import { cn } from '../lib/utils';
import { Text } from '../text';
import { TextClassContext } from '../text/context';

import type { SlottableTextProps } from '@rn-primitives/types';

/**
 * The single select's value, on both platforms: Radix's own Select.Value misbehaved under the
 * content's Presence, and the native re-export does not keep `TextClassContext`.
 */
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
			value={cn(textClass, 'text-base', !value?.value && 'text-muted-foreground', className)}
		>
			{/* An empty `value` is the cleared-selection sentinel, so it reads as no selection. */}
			<Component {...props}>{value?.value ? value.label : placeholder}</Component>
		</TextClassContext.Provider>
	);
}

export { Value };
