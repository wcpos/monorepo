import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import useSnackbar from '@wcpos/components/src/snackbar';

import { t } from '../../../../../../lib/translations';
import useCurrentOrder from '../../contexts/current-order';

interface ActionProps {
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
}

export const Actions = ({ item }: ActionProps) => {
	const { currentOrder } = useCurrentOrder();
	const addSnackbar = useSnackbar();

	/**
	 *
	 */
	const undoRemove = React.useCallback(async () => {
		currentOrder.undoRemoveCartLine(item);
	}, [currentOrder, item]);

	/**
	 *
	 */
	const handleRemove = React.useCallback(async () => {
		const name = item.name || item.method_title;

		await currentOrder?.removeCartLine(item);

		addSnackbar({
			message: t('{name} removed from cart', { name, _tags: 'core' }),
			dismissable: true,
			action: { label: t('Undo', { _tags: 'core' }), action: undoRemove },
		});
	}, [addSnackbar, currentOrder, item, undoRemove]);

	/**
	 *
	 */
	return <Icon name="circleXmark" size="xLarge" onPress={handleRemove} type="critical" />;
};
