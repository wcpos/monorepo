import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservablePickState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, useFormChangeHandler } from '@wcpos/components/src/form';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const formSchema = z.object({
	barcode_scanning_buffer: z.number().default(500),
	barcode_scanning_min_chars: z.number().default(8),
	barcode_scanning_prefix: z.string().optional(),
	barcode_scanning_suffix: z.string().optional(),
});

/**
 *
 */
export const BarcodeSettings = () => {
	const { store } = useAppState();
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const formData = useObservablePickState(
		store.$,
		() => ({
			barcode_scanning_buffer: store.barcode_scanning_buffer,
			barcode_scanning_min_chars: store.barcode_scanning_min_chars,
			barcode_scanning_prefix: store.barcode_scanning_prefix,
			barcode_scanning_suffix: store.barcode_scanning_suffix,
		}),
		'barcode_scanning_buffer',
		'barcode_scanning_min_chars',
		'barcode_scanning_prefix',
		'barcode_scanning_suffix'
	);

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
	 *
	 */
	const handleChange = React.useCallback(
		async (data) => {
			await localPatch({
				document: store,
				data,
			});
		},
		[localPatch, store]
	);

	useFormChangeHandler({ form, onChange: handleChange });

	/**
	 * Track formData changes and reset form
	 */
	React.useEffect(() => {
		form.reset({ ...formData });
	}, [formData, form]);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<View className="grid grid-cols-2 gap-4">
				<FormField
					control={form.control}
					name="barcode_scanning_buffer"
					render={({ field }) => (
						<FormInput
							label={t('Barcode Scanning Buffer (ms)', { _tags: 'core' })}
							type="numeric"
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="barcode_scanning_min_chars"
					render={({ field }) => (
						<FormInput
							label={t('Barcode Minimum Length', { _tags: 'core' })}
							type="numeric"
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="barcode_scanning_prefix"
					render={({ field }) => (
						<FormInput label={t('Barcode Scanner Prefix', { _tags: 'core' })} {...field} />
					)}
				/>
				<FormField
					control={form.control}
					name="barcode_scanning_suffix"
					render={({ field }) => (
						<FormInput label={t('Barcode Scanner Suffix', { _tags: 'core' })} {...field} />
					)}
				/>
			</View>
		</Form>
	);
};
