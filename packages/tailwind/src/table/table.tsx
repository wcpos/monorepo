import * as React from 'react';
import {
	ViewStyle,
	StyleProp,
	FlatListProps,
	ListRenderItemInfo,
	ListRenderItem,
} from 'react-native';

import { TableContext } from './context';
import Empty from './empty';
import { FList } from './flist';
import Header from './header';
import { LoadingRow } from './loading';
import Row from './row';
import * as Styled from './styles';
import ErrorBoundary from '../error-boundary';

// const AnimatedFList = Animated.createAnimatedComponent(FList);
// const AnimatedCellContainer = Animated.createAnimatedComponent(CellContainer);

/**
 *
 */
export type TableProps<T> = {
	/**  */
	style?: StyleProp<ViewStyle>;

	/**  */
	footer?: React.ReactNode;

	/**  */
	context: import('./').TableContextProps<T>;

	/**  */
	renderItem?: ListRenderItem<T>;

	/**  */
	pageSize?: number;

	/**  */
	loading?: boolean;

	/**  */
	hideHeader?: boolean;
} & Omit<FlatListProps<T>, 'extraData' | 'renderItem'>;

/**
 *
 */
const Table = React.forwardRef(
	<T extends object>(
		{
			style,
			footer,
			renderItem,
			context,
			pageSize = 10,
			loading,
			hideHeader,
			...props
		}: TableProps<T>,
		ref: React.Ref<FList<T>>
	) => {
		const [listHeight, setListHeight] = React.useState(0);
		const [containerHeight, setContainerHeight] = React.useState(0);

		/**
		 *
		 */
		const keyExtractor = React.useCallback((item: T, index: number) => {
			return item?.uuid || item?.id || `${index}`;
		}, []);

		/**
		 *
		 */
		const defaultRenderItem = React.useCallback(({ item, index }: ListRenderItemInfo<T>) => {
			return (
				<ErrorBoundary>
					<Row item={item} index={index} />
				</ErrorBoundary>
			);
		}, []);

		/**
		 * Measure the height of the container and list
		 */
		const handleContainerLayout = React.useCallback((event) => {
			const { height } = event.nativeEvent.layout;
			setContainerHeight(height);
		}, []);

		const handleListLayout = React.useCallback((width, height) => {
			setListHeight(height);
		}, []);

		/**
		 * @HACK: This is a hack to trigger onEndReached when the list is smaller than the container
		 */
		React.useEffect(() => {
			if (listHeight < containerHeight && props.onEndReached) {
				props.onEndReached({ distanceFromEnd: 0 });
			}
		}, [containerHeight, listHeight, props]);

		/**
		 *
		 */
		return (
			<TableContext.Provider value={context}>
				<Styled.Table style={style} onLayout={handleContainerLayout}>
					{!hideHeader && (
						<ErrorBoundary>
							<Header />
						</ErrorBoundary>
					)}
					{/* 
			FIXME: FlashList complains about rendered size being not usable, but explicitly setting doesn't fix?
			<View style={{ flex: 1, width: 800, height: 700 }}> */}
					<FList
						ref={ref}
						onContentSizeChange={handleListLayout}
						keyExtractor={keyExtractor}
						ListEmptyComponent={props.ListEmptyComponent || <Empty />}
						// CellRendererComponent={(props) => {
						// 	return <AnimatedCellContainer {...props} />;
						// }}
						renderItem={renderItem || defaultRenderItem}
						// The scrollbars on windows web and desktop are ugly
						// TODO - perhaps have a standard scrollbar for web and desktop
						// See: https://css-tricks.com/the-current-state-of-styling-scrollbars-in-css/#aa-a-cross-browser-demo-of-custom-scrollbars
						showsVerticalScrollIndicator={false}
						onEndReachedThreshold={0.1}
						ListFooterComponent={loading ? LoadingRow : null}
						{...props}
					/>
					{/* </View> */}
					<ErrorBoundary>{footer}</ErrorBoundary>
				</Styled.Table>
			</TableContext.Provider>
		);
	}
);

// export default Table;
export default React.memo(Table);
