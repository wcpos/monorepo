import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Button } from '@wcpos/components/button';
import { Card, CardContent } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { PrinterService } from '@wcpos/printer';
import type { PrinterProfileDocument } from '@wcpos/database';

import { AddPrinter } from './add-printer';
import { toPrinterProfile } from './use-default-printer-profile';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

export function PrinterSettings() {
	const t = useT();
	const { storeDB } = useAppState();
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const printerService = React.useMemo(() => new PrinterService(), []);

	/**
	 * Subscribe to all printer profiles from the RxDB collection.
	 */
	const profiles$ = React.useMemo(() => storeDB.collections.printer_profiles.find().$, [storeDB]);
	const profiles = useObservableState(profiles$, []) as PrinterProfileDocument[];

	/**
	 * Delete a printer profile by its id.
	 */
	const handleDelete = React.useCallback(
		async (id: string) => {
			const doc = await storeDB.collections.printer_profiles.findOne(id).exec();
			if (doc) {
				await doc.remove();
			}
		},
		[storeDB]
	);

	/**
	 * Set a profile as the default and clear the flag on all others.
	 */
	const handleSetDefault = React.useCallback(
		async (id: string) => {
			const allDocs = await storeDB.collections.printer_profiles.find().exec();
			for (const doc of allDocs) {
				if (doc.id === id && !doc.isDefault) {
					await doc.patch({ isDefault: true });
				} else if (doc.id !== id && doc.isDefault) {
					await doc.patch({ isDefault: false });
				}
			}
		},
		[storeDB]
	);

	/**
	 * Test print using the given profile document.
	 */
	const handleTestPrint = React.useCallback(
		async (doc: PrinterProfileDocument) => {
			const profile = toPrinterProfile(doc);
			try {
				await printerService.testPrint(profile);
			} catch {
				// TODO: show error toast
			}
		},
		[printerService]
	);

	/**
	 * Format connection info for display.
	 */
	const connectionLabel = React.useCallback(
		(doc: PrinterProfileDocument) => {
			if (doc.connectionType === 'system') {
				return t('settings.connection_system', 'System Dialog');
			}
			const addr = doc.address || '?';
			const port = doc.port ?? 9100;
			return `${addr}:${port}`;
		},
		[t]
	);

	return (
		<VStack className="gap-4">
			{profiles.length === 0 ? (
				<VStack className="items-center gap-4 py-8">
					<Text className="text-muted-foreground">
						{t('settings.no_printers_configured', 'No printers configured')}
					</Text>
					<Text className="text-muted-foreground text-sm">
						{t(
							'settings.printer_setup_description',
							'Add a thermal receipt printer to enable silent printing without the system dialog.'
						)}
					</Text>
					<Button onPress={() => setDialogOpen(true)}>
						<Text>{t('settings.add_printer', 'Add Printer')}</Text>
					</Button>
				</VStack>
			) : (
				<VStack className="gap-4">
					{profiles.map((doc) => (
						<Card key={doc.id}>
							<CardContent className="p-4">
								<HStack className="items-center justify-between">
									<VStack className="gap-1">
										<HStack className="items-center gap-2">
											<Text className="text-base font-semibold">{doc.name}</Text>
											{doc.isDefault && (
												<View className="bg-primary rounded px-2 py-0.5">
													<Text className="text-primary-foreground text-xs">
														{t('common.default', 'Default')}
													</Text>
												</View>
											)}
										</HStack>
										<Text className="text-muted-foreground text-sm">{connectionLabel(doc)}</Text>
									</VStack>
									<HStack className="gap-2">
										<Button variant="outline" size="sm" onPress={() => handleTestPrint(doc)}>
											<Text>{t('settings.test_print', 'Test')}</Text>
										</Button>
										{!doc.isDefault && (
											<Button variant="outline" size="sm" onPress={() => handleSetDefault(doc.id)}>
												<Text>{t('settings.set_default', 'Set Default')}</Text>
											</Button>
										)}
										<Button variant="destructive" size="sm" onPress={() => handleDelete(doc.id)}>
											<Text>{t('common.delete', 'Delete')}</Text>
										</Button>
									</HStack>
								</HStack>
							</CardContent>
						</Card>
					))}
					<View className="flex-row">
						<Button onPress={() => setDialogOpen(true)}>
							<Text>{t('settings.add_printer', 'Add Printer')}</Text>
						</Button>
					</View>
				</VStack>
			)}

			<AddPrinter
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onSave={() => setDialogOpen(false)}
			/>
		</VStack>
	);
}
