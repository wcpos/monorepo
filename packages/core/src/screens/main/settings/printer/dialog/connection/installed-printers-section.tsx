import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useWatch } from 'react-hook-form';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { DiscoveredPrinter } from '@wcpos/printer';

import { useT } from '../../../../../../contexts/translations';

import type { PrinterFormValues } from '../../schema';
import type { UseFormReturn } from 'react-hook-form';

/**
 * Windows-only. Bluetooth Classic printers paired at the OS level are invisible to the
 * BLE chooser but surface as installed spooler queues (`winspool:*`). List them on the
 * Bluetooth tab so users find their paired printer where they look for it. Selection
 * keeps the form's current connectionType; printing routes natively by the `winspool:`
 * prefix (see packages/printer transport/device-adapter.electron.ts).
 */
export function InstalledPrintersSection({
	form,
	printers,
	onScan,
	scanning,
}: {
	form: UseFormReturn<PrinterFormValues>;
	printers: DiscoveredPrinter[];
	onScan?: () => void;
	scanning?: boolean;
}) {
	const t = useT();
	const selectedAddress = useWatch({ control: form.control, name: 'address' });
	const installed = printers.filter((p) => p.address?.startsWith('winspool:'));

	// useEffect required: imperative one-shot kick of the installed-printers IPC scan
	// when this Windows-only section mounts — there is no user gesture to attach it to,
	// and the result lives in the discovery hook's state, not in render inputs.
	React.useEffect(() => {
		onScan?.();
	}, [onScan]);

	return (
		<VStack className="gap-2">
			<Text className="text-sm font-medium">
				{t('settings.installed_printers', 'Installed printers')}
			</Text>
			<Text className="text-muted-foreground text-xs">
				{t(
					'settings.installed_printers_hint',
					'Printers paired in Windows (including Bluetooth printers) appear here as installed printers.'
				)}
			</Text>
			{scanning && (
				<Text className="text-muted-foreground text-xs">
					{t('settings.installed_printers_loading', 'Loading installed printers…')}
				</Text>
			)}
			{!scanning && installed.length === 0 && (
				<Text className="text-muted-foreground text-xs">
					{t('settings.installed_printers_none', 'No installed printers found.')}
				</Text>
			)}
			{installed.map((p) => {
				const selected = p.address === selectedAddress;
				return (
					<Pressable
						key={p.id}
						testID={`add-printer-installed-device-${p.id}`}
						onPress={() => {
							form.setValue('address', p.address ?? '');
							form.setValue('name', p.name);
						}}
						className={`flex-row items-center gap-2 rounded-md border p-2 ${
							selected ? 'border-primary bg-primary/5' : 'border-border'
						}`}
					>
						<View
							className={`h-4 w-4 rounded-full border-2 ${
								selected ? 'border-primary bg-primary' : 'border-border'
							}`}
						/>
						<Text className="text-sm">{p.name}</Text>
					</Pressable>
				);
			})}
		</VStack>
	);
}
