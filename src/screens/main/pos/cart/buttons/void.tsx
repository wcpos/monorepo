import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import { Button } from '@wcpos/components/src/button';
import { Toast } from '@wcpos/components/src/toast';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../../contexts/translations';
import useDeleteDocument from '../../../contexts/use-delete-document';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const VoidButton = () => {
	const { currentOrder } = useCurrentOrder();
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
		Toast.show({
			type: 'success',
			text1: t('Order removed', { _tags: 'core' }),
			props: {
				dismissable: true,
				action: { label: t('Undo', { _tags: 'core' }), action: () => undoRemove(orderJson) },
			},
		});
	}, [currentOrder, t, deleteDocument, undoRemove]);

	/**
	 *
	 */
	return (
		<Button
			size="lg"
			onPress={handleRemove}
			variant="destructive"
			className="rounded-t-none rounded-br-none flex-1"
		>
			{t('Void', { _tags: 'core' })}
		</Button>
	);
};
