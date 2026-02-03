import * as React from 'react';
import { View } from 'react-native';

import { isRxDocument } from 'rxdb';

import { Button } from '@wcpos/components/button';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import usePushDocument from '../../../contexts/use-push-document';
import { useCurrentOrder } from '../../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'save']);

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
				 * TODO; move this generic sanckbar to the pushDocument hook
				 */
				if (isRxDocument(savedDoc)) {
					cartLogger.success(t('Order #{number} saved', { number: savedDoc.number }), {
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
			cartLogger.error(t('{message}', { message: error.message || 'Error' }), {
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
				{t('Save to Server')}
			</Button>
		</View>
	);
};
