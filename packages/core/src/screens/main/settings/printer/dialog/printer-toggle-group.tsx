import * as React from 'react';

import { FormField, FormSwitch } from '@wcpos/components/form';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../contexts/translations';

import type { UseFormReturn } from 'react-hook-form';
import type { PrinterFormValues } from '../schema';

export function PrinterToggleGroup({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	return (
		<VStack className="gap-2">
			<FormField
				control={form.control}
				name="autoCut"
				render={({ field }) => (
					<FormSwitch
						testID="add-printer-autocut-toggle"
						label={t('settings.auto_cut_paper', 'Auto-cut paper')}
						{...field}
					/>
				)}
			/>
			<FormField
				control={form.control}
				name="autoOpenDrawer"
				render={({ field }) => (
					<FormSwitch
						testID="add-printer-autodrawer-toggle"
						label={t('settings.auto_open_cash_drawer', 'Auto-open cash drawer')}
						{...field}
					/>
				)}
			/>
			<FormField
				control={form.control}
				name="isDefault"
				render={({ field }) => (
					<FormSwitch
						testID="add-printer-default-toggle"
						label={t('settings.set_as_default_printer', 'Set as default')}
						{...field}
					/>
				)}
			/>
		</VStack>
	);
}
