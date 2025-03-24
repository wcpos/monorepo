import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { Toast } from '@wcpos/components/toast';
import log from '@wcpos/utils/logger';

import { useT } from '../../../../../contexts/translations';
import useDeleteDocument from '../../../contexts/use-delete-document';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const VoidButton = () => {
	const { currentOrder } = useCurrentOrder();
	const router = useRouter();
	const deleteDocument = useDeleteDocument();
	const t = useT();

	/**
	 *
	 */
	const undoRemove = React.useCallback(
		async (orderJson) => {
			try {
				await currentOrder.collection.insert(orderJson);
				router.setParams({ orderID: orderJson.uuid });
			} catch (err) {
				log.error(err);
			}
		},
		[router, currentOrder.collection]
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
			className="flex-1 rounded-t-none rounded-br-none"
		>
			{t('Void', { _tags: 'core' })}
		</Button>
	);
};
