import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Button from '@wcpos/components/src/button';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../../../lib/translations';
import useCurrentOrder from '../../contexts/current-order';

/**
 *
 */
const VoidButton = () => {
	const { currentOrder } = useCurrentOrder();
	const addSnackbar = useSnackbar();
	const navigation = useNavigation();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (orderJson) => {
			try {
				await currentOrder.collection.insert(orderJson);
				navigation.setParams({ orderID: orderJson.uuid });
			} catch (err) {
				log.error(err);
			}
		},
		[navigation, currentOrder.collection]
	);

	/**
	 * TODO - don't we just want to set the status to cancelled?
	 */
	const handleRemove = React.useCallback(async () => {
		const orderJson = await currentOrder.toPopulatedJSON();
		const latest = currentOrder.getLatest();
		await latest.remove();
		navigation.setParams({ orderID: '' });
		addSnackbar({
			message: t('Order removed', { _tags: 'core' }),
			dismissable: true,
			action: { label: t('Undo', { _tags: 'core' }), action: () => undoRemove(orderJson) },
		});
	}, [addSnackbar, navigation, currentOrder, undoRemove]);

	/**
	 *
	 */
	return (
		<Button
			fill
			size="large"
			title={t('Void', { _tags: 'core' })}
			onPress={handleRemove}
			type="critical"
			style={{
				flex: 1,
				borderTopLeftRadius: 0,
				borderTopRightRadius: 0,
				borderBottomRightRadius: 0,
			}}
		/>
	);
};

export default VoidButton;
