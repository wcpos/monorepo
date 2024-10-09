import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
// import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import {
	DialogAction,
	DialogClose,
	DialogFooter,
	useRootContext,
} from '@wcpos/components/src/dialog';
import { Form, FormCombobox, FormField, FormInput } from '@wcpos/components/src/form';
// import { Toast } from '@wcpos/components/src/toast';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../../contexts/translations';
import { CurrencySelect } from '../../../../components/currency-select';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
// import usePushDocument from '../../../../contexts/use-push-document';
import { useLocalMutation } from '../../../../hooks/mutations/use-local-mutation';

/**
 *
 */
const formSchema = z.object({
	// number: z.string().optional(), // Order number is read only??!
	currency: z.string().optional(),
	// currency_symbol: z.string().optional(), // Currency symbol is read only
	transaction_id: z.string().optional(),
	meta_data: metaDataSchema,
});

/**
 *
 */
export const EditOrderMetaForm = ({ order, formData }) => {
	const t = useT();
	// const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	// const pushDocument = usePushDocument();
	const { onOpenChange } = useRootContext();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			...formData,
		},
	});

	/**
	 * Track formData changes and reset form
	 */
	React.useEffect(() => {
		form.reset({ ...formData });
	}, [formData, form]);

	/**
	 * Save to local db
	 */
	const handleSave = React.useCallback(
		async (data) => {
			await localPatch({
				document: order,
				data,
			});
			onOpenChange(false);
		},
		[localPatch, onOpenChange, order]
	);

	/**
	 * Save to server
	 *
	 * NOTE: There's an issue if we just patch the form changes, other changes such as customer or if the
	 * order has been reopened will be lost. We need to push the whole order object.
	 */
	// const handleSaveToServer = React.useCallback(
	// 	async (data) => {
	// 		setLoading(true);
	// 		try {
	// 			await localPatch({
	// 				document: order,
	// 				data,
	// 			});
	// 			await pushDocument(order).then((savedDoc) => {
	// 				if (isRxDocument(savedDoc)) {
	// 					Toast.show({
	// 						type: 'success',
	// 						text1: t('Order #{number} saved', { _tags: 'core', number: savedDoc.number }),
	// 					});
	// 				}
	// 			});
	// 		} catch (error) {
	// 			Toast.show({
	// 				type: 'error',
	// 				text1: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
	// 			});
	// 		} finally {
	// 			setLoading(false);
	// 		}
	// 	},
	// 	[localPatch, order, pushDocument, t]
	// );

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<VStack>
					<View className="grid grid-cols-2 gap-4">
						{/* <FormField
							control={form.control}
							name="number"
							render={({ field }) => (
								<FormInput label={t('Order Number', { _tags: 'core' })} {...field} />
							)}
						/> */}
						<FormField
							control={form.control}
							name="currency"
							render={({ field }) => (
								<FormCombobox
									customComponent={CurrencySelect}
									label={t('Currency', { _tags: 'core' })}
									{...field}
								/>
							)}
						/>
						{/* <FormField
							control={form.control}
							name="currency_symbol"
							render={({ field }) => (
								<FormInput
									label={t('Currency Symbol', { _tags: 'core' })}
									placeholder="0"
									{...field}
								/>
							)}
						/> */}
						<FormField
							control={form.control}
							name="transaction_id"
							render={({ field }) => (
								<FormInput label={t('Transaction ID', { _tags: 'core' })} {...field} />
							)}
						/>
					</View>
					<MetaDataForm />
				</VStack>
				<DialogFooter className="px-0">
					<DialogClose>{t('Cancel', { _tags: 'core' })}</DialogClose>
					<DialogAction onPress={form.handleSubmit(handleSave)}>
						{t('Save', { _tags: 'core' })}
					</DialogAction>
				</DialogFooter>
			</VStack>
		</Form>
	);
};
