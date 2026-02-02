import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservablePickState } from 'observable-hooks';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput, useFormChangeHandler } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { VStack } from '@wcpos/components/vstack';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { FormErrors } from '../../components/form-errors';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const formSchema = z.object({
	barcode_scanning_avg_time_input_threshold: z.number().default(24),
	// barcode_scanning_buffer: z.number().default(500),
	barcode_scanning_min_chars: z.number().default(8),
	barcode_scanning_prefix: z.string().default(''),
	barcode_scanning_suffix: z.string().default(''),
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
				barcode_scanning_prefix: latest.barcode_scanning_prefix || '',
				barcode_scanning_suffix: latest.barcode_scanning_suffix || '',
			};
		},
		'barcode_scanning_avg_time_input_threshold',
		'barcode_scanning_min_chars',
		'barcode_scanning_prefix',
		'barcode_scanning_suffix'
	);

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		values: formData,
	});

	/**
	 * Handle form changes and persist to store
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
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-4">
				<FormErrors />
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="barcode_scanning_avg_time_input_threshold"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									label={t('Barcode Average Time Input Threshold (ms)')}
									type="numeric"
									{...field}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="barcode_scanning_min_chars"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput
									label={t('Barcode Minimum Length')}
									type="numeric"
									{...field}
								/>
							</View>
						)}
					/>
				</HStack>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="barcode_scanning_prefix"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Barcode Scanner Prefix')} {...field} />
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="barcode_scanning_suffix"
						render={({ field }) => (
							<View className="flex-1">
								<FormInput label={t('Barcode Scanner Suffix')} {...field} />
							</View>
						)}
					/>
				</HStack>
			</VStack>
		</Form>
	);
};
