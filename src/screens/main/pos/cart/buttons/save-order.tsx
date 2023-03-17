import * as React from 'react';

import { isRxDocument } from 'rxdb';

import Button from '@wcpos/components/src/button';
import { useSnackbar } from '@wcpos/components/src/snackbar/use-snackbar';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../../../lib/translations';
import usePushDocument from '../../../contexts/use-push-document';

interface SaveButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

const SaveButton = ({ order }: SaveButtonProps) => {
	const pushDocument = usePushDocument();
	const [loading, setLoading] = React.useState(false);
	const addSnackbar = useSnackbar();

	return (
		<Button
			title={t('Save to Server', { _tags: 'core' })}
			background="outline"
			onPress={async () => {
				setLoading(true);
				await pushDocument(order)
					.then((savedDoc) => {
						/**
						 * TODO; move this geenric sanckbar to the pushDocument hook
						 */
						if (isRxDocument(savedDoc)) {
							addSnackbar({
								message: t('Order #{number} saved', { _tags: 'core', number: savedDoc.number }),
							});
						}
					})
					.finally(() => setLoading(false));
			}}
			style={{ flex: 1 }}
			loading={loading}
		/>
	);
};

export default SaveButton;
