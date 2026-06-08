import * as React from 'react';

import { FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { Button } from '@wcpos/components/button';
import { VStack } from '@wcpos/components/vstack';
import type { DiscoveredPrinter } from '@wcpos/printer';

import { useT } from '../../../../../../contexts/translations';

import type { UseFormReturn } from 'react-hook-form';
import type { PrinterFormValues } from '../../schema';

interface NetworkFieldsProps {
	form: UseFormReturn<PrinterFormValues>;
	probing: boolean;
	detectedVendor: string | null;
	/** Web only — a derived endpoint URL shown read-only under the IP field. */
	endpointHint?: string;
	/** Electron + native — show a Scan Network button. */
	onScan?: () => void;
	scanning?: boolean;
	printers?: DiscoveredPrinter[];
}

export function NetworkFields({
	form,
	probing,
	detectedVendor,
	endpointHint,
	onScan,
	scanning,
	printers = [],
}: NetworkFieldsProps) {
	const t = useT();
	const detectedVendorLabel =
		detectedVendor == null
			? ''
			: detectedVendor === 'epson'
				? 'Epson'
				: detectedVendor === 'star'
					? 'Star'
					: detectedVendor === 'generic'
						? t('settings.printer_vendor_generic', 'Generic')
						: detectedVendor;
	const networkPrinters = printers.filter((printer) => printer.connectionType === 'network');

	return (
		<VStack className="gap-1">
			<HStack className="items-start gap-3">
				<FormField
					control={form.control}
					name="address"
					render={({ field }) => (
						<FormInput
							testID="add-printer-ip-input"
							label={t('settings.printer_address', 'IP Address')}
							placeholder="192.168.1.100"
							{...field}
						/>
					)}
				/>
				<FormField
					control={form.control}
					name="port"
					render={({ field: { value, ...rest } }) => (
						<FormInput
							testID="add-printer-port-input"
							label={t('settings.printer_port', 'Port')}
							type="numeric"
							value={value != null ? String(value) : undefined}
							className="w-24"
							{...rest}
						/>
					)}
				/>
			</HStack>
			{probing && (
				<Text className="text-muted-foreground text-xs">
					{t('settings.detecting_printer', 'Detecting printer...')}
				</Text>
			)}
			{!probing && detectedVendor && (
				<Text className="text-xs text-green-600">
					{t('settings.detected_vendor', 'Detected: %s').replace('%s', detectedVendorLabel)}
				</Text>
			)}
			{endpointHint && (
				<Text testID="add-printer-endpoint-hint" className="text-muted-foreground text-xs">
					{endpointHint}
				</Text>
			)}
			{onScan && (
				<Button
					testID="add-printer-scan-button"
					variant="outline"
					size="sm"
					className="self-start"
					onPress={onScan}
					loading={scanning}
				>
					<HStack className="items-center gap-1">
						<Icon name="magnifyingGlass" size="sm" />
						<Text>{t('settings.scan_network', 'Scan Network')}</Text>
					</HStack>
				</Button>
			)}
			{scanning && (
				<Text testID="add-printer-network-searching" className="text-muted-foreground text-xs">
					{t('settings.searching_for_printers', 'Searching for printers...')}
				</Text>
			)}
			{!scanning && networkPrinters.length === 0 && onScan && (
				<Text testID="add-printer-network-none-found" className="text-muted-foreground text-xs">
					{t('settings.no_printers_found', 'No printers found')}
				</Text>
			)}
			{networkPrinters.length > 0 && (
				<VStack testID="add-printer-network-results" className="gap-2 pt-1">
					{networkPrinters.map((printer) => (
						<Button
							key={printer.id}
							testID={`add-printer-network-result-${printer.id}`}
							variant="outline"
							className="items-start justify-start"
							onPress={() => {
								form.setValue('connectionType', 'network');
								form.setValue('address', printer.address, { shouldValidate: true });
								form.setValue('name', printer.name);
								if (printer.port != null) {
									form.setValue('port', printer.port, { shouldValidate: true });
								} else {
									form.resetField('port');
								}
								if (printer.vendor) {
									form.setValue('vendor', printer.vendor);
								}
							}}
						>
							<VStack>
								<Text className="text-sm">{printer.name}</Text>
								<Text className="text-muted-foreground text-xs">
									{printer.address}
									{printer.port ? `:${printer.port}` : ''}
								</Text>
							</VStack>
						</Button>
					))}
				</VStack>
			)}
		</VStack>
	);
}
