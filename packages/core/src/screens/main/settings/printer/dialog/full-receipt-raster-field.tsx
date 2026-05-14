import * as React from 'react';

import { FormField, FormSwitch } from '@wcpos/components/form';

import { useT } from '../../../../../contexts/translations';

import type { UseFormReturn } from 'react-hook-form';
import type { PrinterFormValues } from '../schema';

export function FullReceiptRasterField({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	return (
		<FormField
			control={form.control}
			name="fullReceiptRaster"
			render={({ field }) => (
				<FormSwitch
					testID="add-printer-raster-toggle"
					label={t('settings.full_receipt_raster', 'Full receipt raster')}
					description={t(
						'settings.full_receipt_raster_help',
						'Prints the whole receipt as an image for Unicode/RTL compatibility. Slower and larger than text mode.'
					)}
					{...field}
				/>
			)}
		/>
	);
}
