import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import Icon from '@wcpos/common/src/components/icon';
import Button from '@wcpos/common/src/components/button';
// import Popover from '@wcpos/common/src/components/popover';
import Popover from '@wcpos/common/src/components/popover';
import Variations from './variations';
import { usePOSContext } from '../../context';

interface Props {
	item: import('@wcpos/common/src/database').ProductDocument;
}

const Actions = ({ item: product }: Props) => {
	const { currentOrder } = usePOSContext();
	// const [visible, setVisible] = React.useState(false);

	const addToCart = React.useCallback(async () => {
		if (currentOrder) {
			currentOrder.addOrUpdateLineItem(product);
		}
	}, [currentOrder, product]);

	if (!product.isSynced()) {
		return <Icon.Skeleton size="xLarge" />;
	}

	if (product.isVariable()) {
		return (
			<Popover placement="right" content={<Variations product={product} />}>
				<Icon name="circleChevronRight" size="xLarge" type="success" />
			</Popover>
		);
	}

	return <Icon name="circlePlus" size="xLarge" onPress={addToCart} type="success" />;
};

export default Actions;
