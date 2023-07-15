import * as React from 'react';

import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Pressable from '@wcpos/components/src/pressable';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useMeasure from '@wcpos/hooks/src/use-measure';

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
	// const { MeasureWrapper: VariableMeasure, measurements: variableMeasurements } = useMeasure();
	// const { MeasureWrapper: VariationsMeasure, measurements: variationsMeasurements } = useMeasure();
	const [expanded, setExpanded] = React.useState(false);
	const [showVariations, setShowVariations] = React.useState(false);
	const theme = useTheme();

	/**
	 * FIXME: this feels like a hack, surely there's an easier way to keep the variations while the
	 * animation is running.
	 */
	React.useEffect(() => {
		if (expanded) {
			setShowVariations(true);
		}
	}, [expanded]);

	/**
	 *
	 */
	// const animatedStyle = useAnimatedStyle(() => {
	// 	return {
	// 		height: withTiming(
	// 			expanded
	// 				? variableMeasurements.value.height + variationsMeasurements.value.height
	// 				: variableMeasurements.value.height,
	// 			{
	// 				duration: 500,
	// 				easing: Easing.out(Easing.exp),
	// 			},
	// 			() => {
	// 				if (showVariations && !expanded) {
	// 					setShowVariations(false);
	// 				}
	// 			}
	// 		),
	// 	};
	// });

	return (
		<Table.Row
			item={item}
			index={index}
			extraData={extraData}
			target={target}
			cellRenderer={cellRenderer}
		/>
	);

	// /**
	//  *
	//  */
	// return (
	// 	<Animated.View style={[{ overflow: 'hidden' }, animatedStyle]}>
	// 		<VariableMeasure>
	// 			<Table.Row
	// 				item={item}
	// 				index={index}
	// 				extraData={extraData}
	// 				target={target}
	// 				cellRenderer={cellRenderer}
	// 			/>
	// 			<Pressable
	// 				onPress={() => setExpanded((prev) => !prev)}
	// 				style={({ hovered }) => {
	// 					return {
	// 						/** copy alternating background from table component */
	// 						backgroundColor: hovered
	// 							? theme.colors.border
	// 							: index % 2 !== 0
	// 							? theme.colors.lightestGrey
	// 							: 'transparent',
	// 					};
	// 				}}
	// 			>
	// 				<Box
	// 					fill
	// 					horizontal
	// 					padding="xSmall"
	// 					space="xSmall"
	// 					align="center"
	// 					style={{
	// 						justifyContent: 'center',
	// 					}}
	// 				>
	// 					{expanded ? (
	// 						<Icon size="xSmall" name="arrowsToLine" type="textMuted" />
	// 					) : (
	// 						<Icon size="xSmall" name="arrowsFromLine" type="textMuted" />
	// 					)}
	// 					<Text size="small" type="textMuted">
	// 						{expanded
	// 							? t('Collapse variations', { _tags: 'core' })
	// 							: t('Expand variations', { _tags: 'core' })}
	// 					</Text>
	// 				</Box>
	// 			</Pressable>
	// 		</VariableMeasure>
	// 		{showVariations && (
	// 			<VariationsProvider parent={item} uiSettings={extraData.uiSettings}>
	// 				<VariationsMeasure>{children}</VariationsMeasure>
	// 			</VariationsProvider>
	// 		)}
	// 	</Animated.View>
	// );
};

export default VariableProductTableRow;
