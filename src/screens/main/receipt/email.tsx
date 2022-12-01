import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Checkbox from '@wcpos/components/src/checkbox';
import Modal from '@wcpos/components/src/modal';
import TextInput from '@wcpos/components/src/textinput';

import useRestHttpClient from '../../../hooks/use-rest-http-client';
import { t } from '../../../lib/translations';

export const EmailModal = ({ orderID, onClose }) => {
	const http = useRestHttpClient();
	const [isLoading, setIsLoading] = React.useState(false);
	const [form, setForm] = React.useState({
		email: '',
		save_to: false,
	});

	const sendEmail = () => {
		setIsLoading(true);
		http
			.post(`/orders/${orderID}/email`, {
				data: { email: form.email, save_to: form.save_to ? 'billing' : '' },
			})
			.then((response) => {
				if (response.success) {
					// patch order?
				}
			})
			.finally(() => {
				setIsLoading(false);
			});
	};

	return (
		<Modal
			alwaysOpen
			title={t('Email Receipt')}
			primaryAction={{ label: t('Send'), action: sendEmail, isLoading }}
			onClose={onClose}
		>
			<Box space="medium">
				<TextInput
					onChange={(email) =>
						setForm({
							...form,
							email,
						})
					}
					value={form.email}
					label={t('Email Address')}
				/>
				<Checkbox
					onChange={(save_to) =>
						setForm({
							...form,
							save_to,
						})
					}
					value={form.save_to}
					label={t('Save email to Billing Address')}
				/>
			</Box>
		</Modal>
	);
};
