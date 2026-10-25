import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { FormField, FormSwitch, SavedMark } from '@wcpos/components/form';

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
				<HStack className="items-center justify-between">
					<FormSwitch
						testID="add-printer-raster-toggle"
						label={t('settings.full_receipt_raster')}
						description={t('settings.full_receipt_raster_help')}
						{...field}
					/>
					<SavedMark name="fullReceiptRaster" label={t('settings.saved')} />
				</HStack>
			)}
		/>
	);
}
