import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { FormField, FormInput } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Progress } from '@wcpos/components/progress';
import { Text } from '@wcpos/components/text';
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
	/** Web only — why the derived endpoint uses HTTP or HTTPS. */
	endpointExplanation?: string;
	/** Electron + native — show a Scan Network button. */
	onScan?: () => void;
	scanning?: boolean;
	printers?: DiscoveredPrinter[];
	/** Web only — likely-address scan candidates that were checked. */
	scanCandidates?: string[];
	/** Web only — likely-address scan progress. */
	scanProgress?: {
		tested: number;
		total: number;
	};
	/**
	 * Web only — resolve a browser-usable port before applying a scan result,
	 * so raw TCP 9100 never lands in the editable Port field.
	 */
	resolveResultPort?: (printer: DiscoveredPrinter) => number | undefined;
	/** Web only — the endpoint URL web printing will use for a scan result. */
	resultEndpoint?: (printer: DiscoveredPrinter) => string | undefined;
}

export function NetworkFields({
	form,
	probing,
	detectedVendor,
	endpointHint,
	endpointExplanation,
	onScan,
	scanning,
	printers = [],
	scanCandidates = [],
	scanProgress = { tested: 0, total: 0 },
	resolveResultPort,
	resultEndpoint,
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
				<VStack className="min-w-0 flex-1">
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
				</VStack>
				<VStack className="w-24 shrink-0">
					<FormField
						control={form.control}
						name="port"
						render={({ field: { value, ...rest } }) => (
							<FormInput
								testID="add-printer-port-input"
								label={t('settings.printer_port', 'Port')}
								type="numeric"
								value={value != null ? String(value) : undefined}
								{...rest}
							/>
						)}
					/>
				</VStack>
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
				<VStack className="bg-muted/50 gap-0.5 rounded-md p-2">
					<Text className="text-muted-foreground text-xs font-medium">
						{t('settings.web_print_endpoint', 'Web print endpoint')}
					</Text>
					<Text testID="add-printer-endpoint-hint" className="text-xs">
						{endpointHint}
					</Text>
					{endpointExplanation && (
						<Text
							testID="add-printer-endpoint-explanation"
							className="text-muted-foreground text-xs"
						>
							{endpointExplanation}
						</Text>
					)}
				</VStack>
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
			{scanCandidates.length > 0 && (
				<VStack className="bg-muted/50 gap-1 rounded-md p-3" testID="add-printer-scan-candidates">
					{scanning ? (
						<VStack className="gap-1.5">
							<Text className="text-muted-foreground text-xs font-medium">
								{t(
									'settings.scan_candidates_progress',
									'Checking common printer addresses… %s / %s'
								)
									.replace('%s', String(scanProgress.tested))
									.replace('%s', String(scanProgress.total))}
							</Text>
							<Progress
								className="h-1"
								value={
									scanProgress.total > 0 ? (scanProgress.tested / scanProgress.total) * 100 : 0
								}
							/>
						</VStack>
					) : (
						<Collapsible>
							<CollapsibleTrigger testID="add-printer-scan-candidates-toggle">
								<Text className="text-muted-foreground text-xs font-medium">
									{t(
										'settings.scan_candidates_done',
										'Checked %s common printer addresses'
									).replace('%s', String(scanProgress.total || scanCandidates.length))}
								</Text>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<Text className="text-muted-foreground text-xs">{scanCandidates.join(', ')}</Text>
							</CollapsibleContent>
						</Collapsible>
					)}
					<Text className="text-muted-foreground text-xs">
						{t(
							'settings.scan_candidates_hint',
							'If your printer shows a different IP address, add it manually.'
						)}
					</Text>
				</VStack>
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
					{networkPrinters.map((printer) => {
						const endpoint = resultEndpoint?.(printer);
						const discoveredAt = `${printer.address}${printer.port ? `:${printer.port}` : ''}`;
						return (
							<Button
								key={printer.id}
								testID={`add-printer-network-result-${printer.id}`}
								variant="outline"
								className="h-auto items-start justify-start py-2"
								onPress={() => {
									form.setValue('connectionType', 'network');
									form.setValue('address', printer.address, { shouldValidate: true });
									form.setValue('name', printer.name);
									if (printer.vendor) {
										form.setValue('vendor', printer.vendor);
									}
									const port = resolveResultPort ? resolveResultPort(printer) : printer.port;
									if (port != null) {
										form.setValue('port', port, { shouldValidate: true });
									} else {
										form.resetField('port');
									}
								}}
							>
								<VStack className="flex-1 items-start gap-0.5">
									<Text className="text-sm font-medium">{printer.name}</Text>
									<Text className="text-muted-foreground text-xs">
										{t('settings.printer_discovered_at', 'Discovered: %s').replace(
											'%s',
											discoveredAt
										)}
									</Text>
									{endpoint && (
										<Text
											testID={`add-printer-network-result-endpoint-${printer.id}`}
											className="text-muted-foreground text-xs"
										>
											{t('settings.web_print_will_use', 'Web printing will use: %s').replace(
												'%s',
												endpoint
											)}
										</Text>
									)}
									{resultEndpoint && printer.port === 9100 && (
										<Text
											testID={`add-printer-network-result-raw-tcp-${printer.id}`}
											className="text-muted-foreground text-xs"
										>
											{t(
												'settings.raw_tcp_not_supported_on_web',
												'Browsers cannot print to raw TCP port 9100 — the web print endpoint above will be used instead.'
											)}
										</Text>
									)}
									<HStack className="items-center gap-1 pt-1">
										<Icon name="circlePlus" size="sm" className="text-primary" />
										<Text className="text-primary text-xs font-semibold">
											{t('settings.use_this_printer', 'Use this printer')}
										</Text>
									</HStack>
								</VStack>
							</Button>
						);
					})}
				</VStack>
			)}
		</VStack>
	);
}
