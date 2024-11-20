import * as React from 'react';
import { View } from 'react-native';

import { isRxDocument } from 'rxdb';

import { Button } from '@wcpos/components/src/button';
import { Toast } from '@wcpos/components/src/toast';

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
		<View>
			<Button variant="outline" onPress={handleSave} loading={loading} disabled={loading}>
				{t('Save to Server', { _tags: 'core' })}
			</Button>
		</View>
	);
};
