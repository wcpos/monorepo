import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Popover from '@wcpos/components/src/popover';
import Text from '@wcpos/components/src/text';

import { Variations } from './variations';
import { useVariations } from '../../../contexts/variations/use-variations';
import { useCurrentOrder } from '../../contexts/current-order/use-current-order';

interface Props {
	item: import('@wcpos/database').ProductDocument;
}

/**
 * @NOTE - popover is in portal outside of VariationsProvider
 * An inline popover cannot overflow the parent FlashList
 * I could wrap VariationsSelect in VariationsProvider, but that seems messy
 */
export const VariableActions = ({ item: product }: Props) => {
	const [open, setOpen] = React.useState(false);
	const { data: variations } = useVariations();
	const { addVariation } = useCurrentOrder();
	const attributes = useObservableState(product.attributes$, product.attributes);

	return (
		<Popover
			opened={open}
			onClose={() => {
				setOpen(false);
			}}
			withinPortal
			placement="right"
		>
			<Popover.Target>
				<Icon
					name="circleChevronRight"
					size="xLarge"
					type="success"
					onPress={() => {
						setOpen(true);
					}}
				/>
			</Popover.Target>
			<Popover.Content>
				<Variations
					variations={variations}
					attributes={attributes}
					addToCart={(variation, metaData) => addVariation(variation, product, metaData)}
				/>
			</Popover.Content>
		</Popover>
	);
};
