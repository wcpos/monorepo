import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Checkbox from '@wcpos/components/src/checkbox';
import Modal from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';

import { useT } from '../../../../contexts/translations';
import useRestHttpClient from '../../../../hooks/use-rest-http-client';

/**
 *
 */
export const EmailModal = ({ defaultEmail = '', id, setShowEmailModal }) => {
	const [email, setEmail] = React.useState(defaultEmail);
	const [saveEmail, setSaveEmail] = React.useState(false);
	const http = useRestHttpClient();
	const [loading, setLoading] = React.useState(false);
	const addSnackbar = useSnackbar();
	const t = useT();

	/**
	 *
	 */
	const handleSendEmail = React.useCallback(async () => {
		try {
			setLoading(true);
			const { data } = await http.post(`/orders/${id}/email`, {
				email,
				save_to: saveEmail ? 'billing' : '',
			});
			if (data && data.success) {
				setShowEmailModal(false);
				addSnackbar({
					message: t('Email sent', { _tags: 'core' }),
				});
			}
		} catch (error) {
			console.log(error);
		} finally {
			setLoading(false);
		}
	}, [addSnackbar, email, http, id, saveEmail, setShowEmailModal, t]);

	/**
	 *
	 */
	return (
		<Modal
			opened
			onClose={() => {
				setShowEmailModal(false);
			}}
			title={t('Email Receipt', { _tags: 'core' })}
			primaryAction={{
				label: t('Send', { _tags: 'core' }),
				action: handleSendEmail,
				disabled: !email,
				loading,
			}}
		>
			<Box space="medium">
				<TextInputWithLabel
					value={email}
					label={t('Email Address', { _tags: 'core' })}
					onChangeText={setEmail}
				/>
				<Checkbox
					value={saveEmail}
					label={t('Save email to Billing Address', { _tags: 'core' })}
					onChange={setSaveEmail}
				/>
			</Box>
		</Modal>
	);
};
