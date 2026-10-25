import * as React from 'react';
import { View } from 'react-native';

import { type UseFormReturn, useWatch } from 'react-hook-form';

import { HStack } from '@wcpos/components/hstack';
import { FormField, FormItem, FormLabel, FormSelect, SavedMark } from '@wcpos/components/form';

import { DrawerConnectorSelect } from '../components/drawer-connector-select';
import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues } from '../schema';

export function DrawerConnectorField({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	const autoOpenDrawer = useWatch({ control: form.control, name: 'autoOpenDrawer' });

	if (!autoOpenDrawer) return null;

	return (
		<View testID="add-printer-drawer-connector-field">
			<FormField
				control={form.control}
				name="drawerConnector"
				render={({ field: { value, onChange, ...rest } }) => (
					<FormItem>
						<HStack className="justify-between">
							<FormLabel>{t('settings.drawer_connector')}</FormLabel>
							<SavedMark name="drawerConnector" label={t('settings.saved')} />
						</HStack>
						<FormSelect
							customComponent={DrawerConnectorSelect}
							value={value}
							onChange={onChange}
							{...rest}
						/>
					</FormItem>
				)}
			/>
		</View>
	);
}
