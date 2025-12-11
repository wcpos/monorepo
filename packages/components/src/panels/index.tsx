import { View } from 'react-native';

import * as PanelPrimitives from 'react-native-resizable-panels';

import { Icon } from '@wcpos/components/icon';

import { cn } from '../lib/utils';

const Panel = PanelPrimitives.Panel;
const PanelGroup = PanelPrimitives.PanelGroup;
const usePanelGroupContext = PanelPrimitives.usePanelGroupContext;

function PanelResizeHandle() {
	const { direction } = usePanelGroupContext();

	return (
		<PanelPrimitives.PanelResizeHandle
			style={{
				width: direction === 'horizontal' ? 8 : '100%',
				height: direction === 'horizontal' ? '100%' : 8,
				flexDirection: direction === 'horizontal' ? 'row' : 'column',
				// position: 'relative',
				zIndex: 20,
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			{/* <View
				className={cn(
					direction === 'horizontal'
						? 'absolute bottom-0 top-0 w-px bg-gray-200'
						: 'absolute left-0 right-0 h-px bg-gray-200',
					'opacity-0 group-hover:opacity-100'
				)}
			/> */}
			<View
				className={cn(
					'group-hover:border-border group-hover:bg-popover group-hover:animate-fadeIn absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 transform p-1 opacity-20 transition-opacity duration-200 ease-out group-hover:scale-95 group-hover:rounded-md group-hover:border group-hover:opacity-100 group-hover:shadow-md',
					direction === 'horizontal'
						? 'group-hover:cursor-ew-resize'
						: 'group-hover:cursor-ns-resize'
				)}
			>
				<Icon
					name={direction === 'horizontal' ? 'gripLinesVertical' : 'gripLines'}
					className={direction === 'horizontal' ? '-mx-0.5' : '-my-0.5'}
				/>
			</View>
		</PanelPrimitives.PanelResizeHandle>
	);
}

export { Panel, PanelGroup, PanelResizeHandle, usePanelGroupContext };
