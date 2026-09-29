import * as React from 'react';
import { View, type ViewStyle } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { TableHead } from '@wcpos/components/table';

import { getColumnStyle } from '../index';

type Meta = { width?: number; flex?: number; align?: 'left' | 'right' | 'center' };
export function ResizeHead({
	columnId,
	meta,
	last,
	resizable = true,
	onResize,
	children,
}: {
	columnId: string;
	meta?: Meta;
	last: boolean;
	/** The trailing actions head keeps its configured width and offers no drag edge. */
	resizable?: boolean;
	onResize: (width: number) => void;
	children: React.ReactNode;
}) {
	const measured = useSharedValue(meta?.width ?? 44);
	const start = useSharedValue(44);
	const pan = Gesture.Pan()
		.runOnJS(true)
		.onBegin(() => {
			start.set(measured.get());
		})
		.onEnd((event) => onResize(Math.max(44, start.get() + event.translationX)));
	const style: ViewStyle = getColumnStyle(last ? { ...meta, width: undefined, flex: 1 } : meta);
	return (
		<TableHead
			testID={`data-table-head-${columnId}`}
			className="min-h-row relative"
			style={style}
			onLayout={(event) => {
				measured.set(event.nativeEvent.layout.width);
			}}
		>
			{children}
			{!last && resizable && (
				<GestureDetector gesture={pan}>
					<View
						testID={`data-table-resize-${columnId}`}
						className="absolute inset-y-0 right-0 w-2"
					/>
				</GestureDetector>
			)}
		</TableHead>
	);
}
