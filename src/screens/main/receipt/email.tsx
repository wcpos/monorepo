import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableEagerState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { DialogAction, DialogClose, DialogFooter } from '@wcpos/components/src/dialog';
import { Form, FormInput, FormField, FormSwitch } from '@wcpos/components/src/form';
import { Toast } from '@wcpos/components/src/toast';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../contexts/translations';
import { useRestHttpClient } from '../hooks/use-rest-http-client';

const formSchema = z.object({
	email: z.string().email(),
	saveEmail: z.boolean(),
});

interface Props {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
export const EmailForm = ({ order }: Props) => {
	const http = useRestHttpClient();
	const [loading, setLoading] = React.useState(false);
	const t = useT();
	const orderID = useObservableEagerState(order.id$);
	const defaultEmail = useObservableEagerState(order.billing.email$);

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
						type: 'success',
						text1: t('Email sent', { _tags: 'core' }),
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
		<VStack className="gap-4">
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
							<FormSwitch
								label={t('Save email to Billing Address', { _tags: 'core' })}
								{...field}
							/>
						)}
					/>
				</VStack>
			</Form>
			<DialogFooter className="px-0">
				<DialogClose>{t('Cancel', { _tags: 'core' })}</DialogClose>
				<DialogAction onPress={form.handleSubmit(handleSendEmail)} loading={loading}>
					{t('Send', { _tags: 'core' })}
				</DialogAction>
			</DialogFooter>
		</VStack>
	);
};
