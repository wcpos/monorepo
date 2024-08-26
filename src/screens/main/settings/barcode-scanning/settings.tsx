import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Form, FormField, FormInput } from '@wcpos/components/src/form';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

const fields = [
	'barcode_scanning_buffer',
	'barcode_scanning_min_chars',
	'barcode_scanning_prefix',
	'barcode_scanning_suffix',
];

/**
 *
 */
export const BarcodeSettings = () => {
	const { store } = useAppState();
	const t = useT();

	/**
	 *
	 */
	const formSchema = React.useMemo(
		() =>
			z.object({
				barcode_scanning_buffer: z.number().default(500),
				barcode_scanning_min_chars: z.number().default(8),
				barcode_scanning_prefix: z.string().default(''),
				barcode_scanning_suffix: z.string().default(''),
			}),
		[]
	);

	/**
	 *
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			barcode_scanning_buffer: store.barcode_scanning_buffer ?? 500,
			barcode_scanning_min_chars: store.barcode_scanning_min_chars ?? 8,
			barcode_scanning_prefix: store.barcode_scanning_prefix ?? '',
			barcode_scanning_suffix: store.barcode_scanning_suffix ?? '',
		},
	});

	// Watch all form fields
	const watchedValues = form.watch();

	/**
	 * Function to get the patched changes
	 */
	const getPatchedChanges = () => {
		const currentValues = form.getValues();
		const patchedChanges = {};

		fields.forEach((field) => {
			if (store[field] !== currentValues[field]) {
				patchedChanges[field] = currentValues[field];
			}
		});

		return patchedChanges;
	};

	React.useEffect(() => {
		// Example: Log patched changes whenever form values change
		console.log('Patched Changes:', getPatchedChanges());
	}, [watchedValues]);

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
