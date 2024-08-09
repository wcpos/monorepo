import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Form, FormInput, FormField, FormSwitch } from '@wcpos/tailwind/src/form';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Toast } from '@wcpos/tailwind/src/toast';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../contexts/translations';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const formSchema = z.object({
	email: z.string().email(),
	saveEmail: z.boolean(),
});

interface Props {
	defaultEmail?: string;
	orderID: number;
}

/**
 *
 */
export const EmailForm = ({ defaultEmail = '', orderID }: Props) => {
	const http = useRestHttpClient();
	const [loading, setLoading] = React.useState(false);
	const t = useT();

	/**
	 *
	 */
	const handleSendEmail = React.useCallback(
		async ({ email, saveEmail }) => {
			try {
				setLoading(true);
				const { data } = await http.post(`/orders/${orderID}/email`, {
					email,
					save_to: saveEmail ? 'billing' : '',
				});
				if (data && data.success) {
					Toast.show({
						text1: t('Email sent', { _tags: 'core' }),
						type: 'success',
					});
				}
			} catch (error) {
				console.log(error);
			} finally {
				setLoading(false);
			}
		},
		[http, orderID, t]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: defaultEmail,
			saveEmail: false,
		},
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack>
				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormInput label={t('Email Address', { _tags: 'core' })} {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="saveEmail"
					render={({ field }) => (
						<FormSwitch label={t('Save email to Billing Address', { _tags: 'core' })} {...field} />
					)}
				/>
			</VStack>
			<HStack className="justify-end">
				<Button onPress={form.handleSubmit(handleSendEmail)} loading={loading}>
					<ButtonText>{t('Send', { _tags: 'core' })}</ButtonText>
				</Button>
			</HStack>
		</Form>
	);
};
