import * as React from 'react';

import { isRxDocument } from 'rxdb';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Toast } from '@wcpos/tailwind/src/toast';

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
					Toast.show({
						type: 'success',
						text1: t('Order #{number} saved', { _tags: 'core', number: savedDoc.number }),
					});
				}
			});
		} catch (error) {
			Toast.show({
				type: 'error',
				text1: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
			});
		} finally {
			setLoading(false);
		}
	}, [currentOrder, pushDocument, t]);

	/**
	 *
	 */
	return (
		<Button variant="outline" onPress={handleSave} loading={loading} disabled={loading}>
			<ButtonText numberOfLines={1}>{t('Save to Server', { _tags: 'core' })}</ButtonText>
		</Button>
	);
};
