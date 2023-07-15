import * as React from 'react';

import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Pressable from '@wcpos/components/src/pressable';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useMeasure from '@wcpos/hooks/src/use-measure';

import { useVariableProductRow } from './variable-row-provider';
import { t } from '../../../../lib/translations';
import { VariationsProvider } from '../../contexts/variations';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface VariableProductTableRowProps {
	children?: React.ReactNode;
	item: ProductDocument;
	index: number;
	extraData: any;
	target: any;
	cellRenderer: CellRenderer<ProductDocument>;
}

/**
 *
 */
const VariableProductTableRow = ({
	children,
	item,
	index,
	extraData,
	target,
	cellRenderer,
}: VariableProductTableRowProps) => {
	const { expanded } = useVariableProductRow();

	/**
	 *
	 */
	// const animatedStyle = useAnimatedStyle(() => {
	// 	return {
	// 		height: withTiming(
	// 			expanded ? 500 : 100,
	// 			{
	// 				duration: 500,
	// 				easing: Easing.out(Easing.exp),
	// 			},
	// 			() => {}
	// 		),
	// 	};
	// });

	return (
		// <Animated.View style={animatedStyle}>
		<Box>
			<Table.Row
				item={item}
				index={index}
				extraData={extraData}
				target={target}
				cellRenderer={cellRenderer}
			/>
			{expanded && (
				<VariationsProvider parent={item} uiSettings={extraData.uiSettings}>
					{children}
				</VariationsProvider>
			)}
		</Box>
		// </Animated.View>
	);
};

export default VariableProductTableRow;
