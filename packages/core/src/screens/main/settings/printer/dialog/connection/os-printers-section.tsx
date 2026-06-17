import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useWatch } from 'react-hook-form';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { DiscoveredPrinter } from '@wcpos/printer';

import type { PrinterFormValues } from '../../schema';
import type { UseFormReturn } from 'react-hook-form';

/**
 * Generic OS-paired-printers section. Covers two cases:
 *
 * - Windows: Bluetooth Classic printers paired at the OS level are invisible to the
 *   BLE chooser but surface as installed spooler queues (`winspool:*`). Listed on the
 *   Bluetooth tab so users find their paired printer where they look for it. Selection
 *   keeps the form's current connectionType; printing routes natively by the `winspool:`
 *   prefix (see packages/printer transport/device-adapter.electron.ts).
 *
 * - macOS/Linux: Bluetooth Classic printers paired via System Settings surface as serial
 *   ports (`serial:/dev/...`). Listed on the Bluetooth tab for the same discoverability
 *   reason. Printing routes via the `serial:` prefix in device-adapter.electron.ts.
 */
export interface OsPrintersSectionProps {
	form: UseFormReturn<PrinterFormValues>;
	printers: DiscoveredPrinter[];
	onScan?: () => void;
	scanning?: boolean;
	/** Address prefix that identifies this section's printers (e.g. 'winspool:', 'serial:'). */
	addressPrefix: string;
	heading: string;
	hint: string;
	emptyText: string;
	loadingText: string;
	/** Prefix for per-row testIDs, e.g. 'add-printer-installed-device'. */
	testIdPrefix: string;
}

export function OsPrintersSection({
	form,
	printers,
	onScan,
	scanning,
	addressPrefix,
	heading,
	hint,
	emptyText,
	loadingText,
	testIdPrefix,
}: OsPrintersSectionProps) {
	const selectedAddress = useWatch({ control: form.control, name: 'address' });
	const filtered = printers.filter((p) => p.address?.startsWith(addressPrefix));

	// useEffect required: imperative one-shot kick of the OS-printers IPC scan
	// when this section mounts — there is no user gesture to attach it to,
	// and the result lives in the discovery hook's state, not in render inputs.
	React.useEffect(() => {
		onScan?.();
	}, [onScan]);

	return (
		<VStack className="gap-2">
			<Text className="text-sm font-medium">{heading}</Text>
			<Text className="text-muted-foreground text-xs">{hint}</Text>
			{scanning && <Text className="text-muted-foreground text-xs">{loadingText}</Text>}
			{!scanning && filtered.length === 0 && (
				<Text className="text-muted-foreground text-xs">{emptyText}</Text>
			)}
			{filtered.map((p) => {
				const selected = p.address === selectedAddress;
				return (
					<Pressable
						key={p.id}
						testID={`${testIdPrefix}-${p.id}`}
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
