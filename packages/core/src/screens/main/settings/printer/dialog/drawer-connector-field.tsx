import * as React from 'react';
import { View } from 'react-native';

import { FormField, FormSelect } from '@wcpos/components/form';

import { DrawerConnectorSelect } from '../components/drawer-connector-select';
import { useT } from '../../../../../contexts/translations';

import type { UseFormReturn } from 'react-hook-form';
import type { PrinterFormValues } from '../schema';

export function DrawerConnectorField({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	const autoOpenDrawer = form.watch('autoOpenDrawer');

	if (!autoOpenDrawer) return null;

	return (
		<View testID="add-printer-drawer-connector-field">
			<FormField
				control={form.control}
				name="drawerConnector"
				render={({ field: { value, onChange, ...rest } }) => (
					<FormSelect
						customComponent={DrawerConnectorSelect}
						label={t('settings.drawer_connector', 'Cash drawer connector')}
						value={value}
						onChange={onChange}
						{...rest}
					/>
				)}
			/>
		</View>
	);
}
