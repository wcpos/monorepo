import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Button from '@wcpos/components/src/button';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../../contexts/translations';
import useDeleteDocument from '../../../contexts/use-delete-document';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
const VoidButton = () => {
	const { currentOrder } = useCurrentOrder();
	const addSnackbar = useSnackbar();
	const navigation = useNavigation();
	const deleteDocument = useDeleteDocument();
	const t = useT();

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
	 *
	 */
	const handleRemove = React.useCallback(async () => {
		const orderJson = await currentOrder.toPopulatedJSON();
		const latest = currentOrder.getLatest();
		if (latest.id) {
			deleteDocument(latest.id, latest.collection);
		}
		latest.remove();
		addSnackbar({
			message: t('Order removed', { _tags: 'core' }),
			dismissable: true,
			action: { label: t('Undo', { _tags: 'core' }), action: () => undoRemove(orderJson) },
		});
	}, [currentOrder, addSnackbar, t, deleteDocument, undoRemove]);

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
