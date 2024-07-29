import * as React from 'react';

import { isRxDocument } from 'rxdb';

import { useSnackbar } from '@wcpos/components/src/snackbar/use-snackbar';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';

import { useT } from '../../../../../contexts/translations';
import usePushDocument from '../../../contexts/use-push-document';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
const SaveButton = () => {
	const { currentOrder } = useCurrentOrder();
	const pushDocument = usePushDocument();
	const [loading, setLoading] = React.useState(false);
	const addSnackbar = useSnackbar();
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
					addSnackbar({
						message: t('Order #{number} saved', { _tags: 'core', number: savedDoc.number }),
					});
				}
			});
		} catch (error) {
			addSnackbar({
				message: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
			});
		} finally {
			setLoading(false);
		}
	}, [addSnackbar, currentOrder, pushDocument, t]);

	/**
	 *
	 */
	return (
		<Button variant="outline" onPress={handleSave} loading={loading} disabled={loading}>
			<ButtonText numberOfLines={1}>{t('Save to Server', { _tags: 'core' })}</ButtonText>
		</Button>
	);
};

export default SaveButton;
