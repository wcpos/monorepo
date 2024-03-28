import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import useSnackbar from '@wcpos/components/src/snackbar';

import { useT } from '../../../../../contexts/translations';
import { useCurrentOrder } from '../../contexts/current-order';

interface ActionProps {
	uuid: string;
	type: 'line_items' | 'fee_lines' | 'shipping_lines';
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
}

export const Actions = ({ uuid, type, item }: ActionProps) => {
	const { currentOrder } = useCurrentOrder();
	const addSnackbar = useSnackbar();
	const t = useT();

	/**
	 *
	 */
	const undoRemove = React.useCallback(async () => {
		return currentOrder?.incrementalUpdate({
			$push: {
				[type]: item,
			},
		});
	}, [currentOrder, item, type]);

	/**
	 *
	 */
	const handleRemove = React.useCallback(async () => {
		const name = item.name || item.method_title;
		const order = currentOrder.getLatest();

		// find uuid and remove from order
		const updatedItems = order[type].filter(
			(i) =>
				!i.meta_data.some((meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid)
		);

		// Update the order with the item removed
		await currentOrder.incrementalPatch({
			[type]: updatedItems,
		});

		addSnackbar({
			message: t('{name} removed from cart', { name, _tags: 'core' }),
			dismissable: true,
			action: { label: t('Undo', { _tags: 'core' }), action: undoRemove },
		});
	}, [addSnackbar, currentOrder, item.method_title, item.name, t, type, undoRemove, uuid]);

	/**
	 *
	 */
	return <Icon name="circleXmark" size="xLarge" onPress={handleRemove} type="critical" />;
};
