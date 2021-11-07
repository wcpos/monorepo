import * as React from 'react';
import { View, ViewStyle, NativeSyntheticEvent, NativeTouchEvent } from 'react-native';
import { useVirtual } from 'react-virtual';
import get from 'lodash/get';
import Text from '../text';
import EmptyRow from './empty';

export type RowVirtualizer = ReturnType<typeof useVirtual>;

export interface VirtualListProps<T extends object> {
	/**
	 * The data source to render
	 */
	data: T[];
	style?: ViewStyle;
	/**
	 * additional context that will be passed verbatim to the itemRenderer, so that it can be easily memoized
	 */
	context?: any;
	/**
	 * Takes care of rendering an item
	 * @param item The item as stored in the dataSource
	 * @param index The index of the item being rendered. The index represents the offset in the _visible_ items of the dataSource
	 * @param context The optional context passed into this DataSourceRenderer
	 */
	rowRenderer: (item: T, index: number, context: any) => React.ReactNode;
	emptyRenderer?: () => React.ReactNode;
	virtualizerRef?: React.MutableRefObject<RowVirtualizer | undefined>;
}

/**
 * This component is UI agnostic, and just takes care of virtualizing the provided dataSource, and render it as efficiently a possibible,
 * de priorizing off screen updates etc.
 */
// @ts-ignore
export const VirtualList: <T extends object>(props: VirtualListProps<T>) => React.ReactElement =
	React.memo(function VirtualList({
		data,
		style,
		context,
		emptyRenderer = () => <EmptyRow />,
		rowRenderer,
		virtualizerRef,
	}) {
		const parentRef = React.useRef() as React.MutableRefObject<View>;
		const [, setForceUpdate] = React.useState(0);
		const forceHeightRecalculation = React.useRef(0);

		/**
		 *
		 */
		const rowVirtualizer = useVirtual({
			size: data.length,
			parentRef,
			overscan: 10,
		});
		if (virtualizerRef) {
			virtualizerRef.current = rowVirtualizer;
		}

		/**
		 *
		 */
		const keyExtractor = React.useCallback(
			(item: any, index: number) => get(item, 'localID') || index,
			[]
		);

		/**
		 *
		 */
		const redraw = React.useCallback(() => {
			forceHeightRecalculation.current++;
			setForceUpdate((x) => x + 1);
		}, []);

		return (
			<RedrawContext.Provider value={redraw}>
				<View
					ref={parentRef}
					style={{ overflow: 'scroll', flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
				>
					{rowVirtualizer.virtualItems.length === 0 ? emptyRenderer?.() : null}
					<View style={{ position: 'relative', width: '100&', height: rowVirtualizer.totalSize }}>
						{rowVirtualizer.virtualItems.map((virtualRow) => {
							const item = data[virtualRow.index];
							return (
								<View
									key={keyExtractor(item, virtualRow.index)}
									// @ts-ignore - may not work with react-native View?
									ref={virtualRow.measureRef}
									style={{
										position: 'absolute',
										top: 0,
										left: 0,
										width: '100%',
										transform: [{ translateY: virtualRow.start }],
									}}
								>
									{rowRenderer(item, virtualRow.index, context)}
								</View>
							);
						})}
					</View>
				</View>
			</RedrawContext.Provider>
		);
	});

export const RedrawContext = React.createContext<undefined | (() => void)>(undefined);

export function useTableRedraw() {
	return React.useContext(RedrawContext);
}

// export default React.memo(VirtualList);
