import * as React from 'react';
import { View } from 'react-native';

import * as PanelPrimitives from 'react-native-resizable-panels';

import { usePointer } from '../lib/device';
import { cn } from '../lib/utils';

const Panel = PanelPrimitives.Panel;
const PanelGroup = PanelPrimitives.PanelGroup;
const usePanelGroupContext = PanelPrimitives.usePanelGroupContext;

function PanelResizeHandle({
	testID,
	order,
	disableDoubleTap,
	hitTargetSize,
}: Pick<
	PanelPrimitives.PanelResizeHandleProps,
	'testID' | 'order' | 'disableDoubleTap' | 'hitTargetSize'
>) {
	const { direction } = usePanelGroupContext();
	// Hover is a fine-pointer state (ledger line 1: never on a touch screen); the key comes
	// from lib/device, not a platform read.
	const pointer = usePointer();
	const [hovered, setHovered] = React.useState(false);
	const [dragging, setDragging] = React.useState(false);

	const handleProps: PanelPrimitives.PanelResizeHandleProps = {
		testID,
		order,
		disableDoubleTap,
		hitTargetSize,
		onDragging: setDragging,
		// On the whole 8 px handle, not the 4 px bar: the pointer can rest on the hit target
		// without crossing the bar (CodeRabbit on #2213).
		onPointerEnter: () => {
			if (pointer === 'fine') setHovered(true);
		},
		onPointerLeave: () => setHovered(false),
		style: {
			width: direction === 'horizontal' ? 8 : '100%',
			height: direction === 'horizontal' ? '100%' : 8,
			flexDirection: direction === 'horizontal' ? ('row' as const) : ('column' as const),
			zIndex: 20,
			alignItems: 'center' as const,
			justifyContent: 'center' as const,
		},
	};

	return (
		<PanelPrimitives.PanelResizeHandle {...handleProps}>
			<View
				className={cn(
					'web:transition-colors rounded-full',
					direction === 'horizontal'
						? 'web:cursor-ew-resize h-12 w-1'
						: 'web:cursor-ns-resize h-1 w-12',
					dragging ? 'bg-primary' : hovered ? 'bg-muted-foreground' : 'bg-border'
				)}
			/>
		</PanelPrimitives.PanelResizeHandle>
	);
}

export { Panel, PanelGroup, PanelResizeHandle, usePanelGroupContext };
