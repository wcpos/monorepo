import * as React from 'react';

import { FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { Button } from '@wcpos/components/button';
import { VStack } from '@wcpos/components/vstack';

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
}

export function NetworkFields({
	form,
	probing,
	detectedVendor,
	endpointHint,
	onScan,
	scanning,
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

	return (
		<VStack className="gap-1">
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
		</VStack>
	);
}
