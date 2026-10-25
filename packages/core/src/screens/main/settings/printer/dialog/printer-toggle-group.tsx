import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { FormField, FormSwitch, SavedMark } from '@wcpos/components/form';
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
					<HStack className="items-center justify-between">
						<FormSwitch
							testID="add-printer-autocut-toggle"
							label={t('settings.auto_cut_paper')}
							{...field}
						/>
						<SavedMark name="autoCut" label={t('settings.saved')} />
					</HStack>
				)}
			/>
			<FormField
				control={form.control}
				name="autoOpenDrawer"
				render={({ field }) => (
					<HStack className="items-center justify-between">
						<FormSwitch
							testID="add-printer-autodrawer-toggle"
							label={t('settings.auto_open_cash_drawer')}
							{...field}
						/>
						<SavedMark name="autoOpenDrawer" label={t('settings.saved')} />
					</HStack>
				)}
			/>
			<FormField
				control={form.control}
				name="isDefault"
				render={({ field }) => (
					<HStack className="items-center justify-between">
						<FormSwitch
							testID="add-printer-default-toggle"
							label={t('settings.set_as_default_printer')}
							{...field}
						/>
						<SavedMark name="isDefault" label={t('settings.saved')} />
					</HStack>
				)}
			/>
		</VStack>
	);
}
