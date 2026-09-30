import * as React from 'react';
import type { ViewInstance } from 'react-native';

import { Chip } from '@wcpos/components/chip';
import { useComposedRefs } from '@wcpos/components/lib/utils';

// Clearing replaces the split-control root on web; retain the picker's anchor too.
export function FilterChip({
	ref,
	...props
}: React.ComponentProps<typeof Chip> & { ref?: React.Ref<ViewInstance> }) {
	const focusAfterClear = React.useRef(false);
	const composedRef = useComposedRefs(ref, (node: ViewInstance | null) => {
		if (node && focusAfterClear.current) {
			focusAfterClear.current = false;
			node.focus();
		}
	});
	return (
		<Chip
			{...props}
			{...{ ref: composedRef }}
			onClear={
				props.onClear
					? () => {
							focusAfterClear.current = true;
							props.onClear?.();
						}
					: undefined
			}
		/>
	);
}
