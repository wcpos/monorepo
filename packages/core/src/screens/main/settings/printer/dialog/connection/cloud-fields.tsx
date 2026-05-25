import * as React from 'react';

import { FormField } from '@wcpos/components/form';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';

import { useRestHttpClient } from '../../../../hooks/use-rest-http-client';
import { useT } from '../../../../../../contexts/translations';

import type { UseFormReturn } from 'react-hook-form';
import type { PrinterFormValues } from '../../schema';

interface CloudPrinter {
	id: string;
	name: string;
}

interface CloudPrintSettingsResponse {
	data?: {
		printers?: CloudPrinter[];
	};
}

export function CloudFields({ form }: { form: UseFormReturn<PrinterFormValues> }) {
	const t = useT();
	const http = useRestHttpClient();
	const [printers, setPrinters] = React.useState<CloudPrinter[]>([]);

	React.useEffect(() => {
		let cancelled = false;
		async function fetchPrinters() {
			try {
				const res = (await http.get('/settings/cloud-print')) as CloudPrintSettingsResponse;
				if (!cancelled) {
					setPrinters(res.data?.printers ?? []);
				}
			} catch {
				if (!cancelled) {
					setPrinters([]);
				}
			}
		}
		void fetchPrinters();
		return () => {
			cancelled = true;
		};
	}, [http]);

	return (
		<FormField
			control={form.control}
			name="cloudPrinterId"
			render={({ field }) => {
				const selected = printers.find((p) => p.id === field.value);
				return (
					<Select
						value={selected ? { value: selected.id, label: selected.name } : undefined}
						onValueChange={(option) => field.onChange(option?.value ?? '')}
					>
						<SelectTrigger testID="cloud-printer-select">
							<SelectValue
								placeholder={t('settings.select_cloud_printer', 'Select a cloud printer')}
							/>
						</SelectTrigger>
						<SelectContent matchWidth>
							{printers.map((p) => (
								<SelectItem
									key={p.id}
									value={p.id}
									label={p.name}
									testID={`cloud-printer-option-${p.id}`}
								>
									<Text>{p.name}</Text>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				);
			}}
		/>
	);
}
