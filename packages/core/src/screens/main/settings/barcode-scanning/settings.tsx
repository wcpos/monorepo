import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservablePickState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, useFormChangeHandler } from '@wcpos/components/src/form';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { FormErrors } from '../../components/form-errors';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const formSchema = z.object({
	barcode_scanning_avg_time_input_threshold: z.number().default(24),
	// barcode_scanning_buffer: z.number().default(500),
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
		() => {
			const latest = store.getLatest();
			return {
				barcode_scanning_avg_time_input_threshold: latest.barcode_scanning_avg_time_input_threshold,
				barcode_scanning_min_chars: latest.barcode_scanning_min_chars,
				barcode_scanning_prefix: latest.barcode_scanning_prefix,
				barcode_scanning_suffix: latest.barcode_scanning_suffix,
			};
		},
		'barcode_scanning_avg_time_input_threshold',
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
			<VStack className="gap-4">
				<FormErrors />
				<View className="grid grid-cols-2 gap-4">
					<FormField
						control={form.control}
						name="barcode_scanning_avg_time_input_threshold"
						render={({ field }) => (
							<FormInput
								label={t('Barcode Average Time Input Threshold (ms)', { _tags: 'core' })}
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
			</VStack>
		</Form>
	);
};
