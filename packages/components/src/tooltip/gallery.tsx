import * as React from 'react';
import { View } from 'react-native';

import * as TooltipPrimitive from '@rn-primitives/tooltip';

import { Tooltip, TooltipContent } from './index';
import { IconButton } from '../icon-button';
import { Text } from '../text';

// Opened once through the trigger's own handle: the gallery cannot hover, and the
// primitive's root is uncontrolled.
function Open({ side }: { side: 'top' | 'bottom' }) {
	const trigger = React.useRef<TooltipPrimitive.TriggerRef>(null);
	React.useEffect(() => trigger.current?.open(), []);
	return (
		<Tooltip delayDuration={0}>
			<TooltipPrimitive.Trigger ref={trigger} asChild>
				<IconButton name="info" accessibilityLabel="Stock" testID="gallery-tooltip-trigger" />
			</TooltipPrimitive.Trigger>
			<TooltipContent side={side} avoidCollisions={false}>
				<Text>12 in stock</Text>
			</TooltipContent>
		</Tooltip>
	);
}

// The tooltip sits outside the trigger, so the cell keeps room for it on the side it opens.
export const stories = (['top', 'bottom'] as const).map((side) => ({
	id: side,
	isolated: true,
	render: () => (
		<View className="h-32 w-64 items-center justify-center">
			<Open side={side} />
		</View>
	),
}));
