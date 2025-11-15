import * as React from 'react';
import { View } from 'react-native';

import { isRxDocument } from 'rxdb';

import { Button } from '@wcpos/components/button';
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import usePushDocument from '../../../contexts/use-push-document';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const SaveButton = () => {
	const { currentOrder } = useCurrentOrder();
	const pushDocument = usePushDocument();
	const [loading, setLoading] = React.useState(false);
	const t = useT();

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		setLoading(true);
		try {
			await pushDocument(currentOrder).then((savedDoc) => {
				/**
				 * TODO; move this geenric sanckbar to the pushDocument hook
				 */
				if (isRxDocument(savedDoc)) {
					log.success(t('Order #{number} saved', { _tags: 'core', number: savedDoc.number }), {
						showToast: true,
						saveToDb: true,
						context: {
							orderId: savedDoc.id,
							orderNumber: savedDoc.number,
						},
					});
				}
			});
		} catch (error) {
			log.error(t('{message}', { _tags: 'core', message: error.message || 'Error' }), {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					orderId: currentOrder.id,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			setLoading(false);
		}
	}, [currentOrder, pushDocument, t]);

	/**
	 *
	 */
	return (
		<View>
			<Button variant="outline" onPress={handleSave} loading={loading} disabled={loading}>
				{t('Save to Server', { _tags: 'core' })}
			</Button>
		</View>
	);
};
