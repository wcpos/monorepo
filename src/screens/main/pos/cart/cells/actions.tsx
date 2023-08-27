import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import useSnackbar from '@wcpos/components/src/snackbar';

import { useT } from '../../../../../contexts/translations';
import { useCurrentOrder } from '../../contexts/current-order';
import { useRemoveItem } from '../../hooks/use-remove-item';

interface ActionProps {
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
}

export const Actions = ({ item }: ActionProps) => {
	const { currentOrder } = useCurrentOrder();
	const { removeItem } = useRemoveItem();
	const addSnackbar = useSnackbar();
	const t = useT();

	/**
	 *
	 */
	const undoRemove = React.useCallback(async () => {
		return currentOrder?.incrementalUpdate({
			$push: {
				[item.collection.name]: item.toJSON(),
			},
		});
	}, [currentOrder, item]);

	/**
	 *
	 */
	const handleRemove = React.useCallback(async () => {
		const name = item.name || item.method_title;
		await item.incrementalRemove();
		// await removeItem(item);

		// await currentOrder?.removeCartLine(item);

		addSnackbar({
			message: t('{name} removed from cart', { name, _tags: 'core' }),
			dismissable: true,
			action: { label: t('Undo', { _tags: 'core' }), action: undoRemove },
		});
	}, [addSnackbar, item, t, undoRemove]);

	/**
	 *
	 */
	return <Icon name="circleXmark" size="xLarge" onPress={handleRemove} type="critical" />;
};
