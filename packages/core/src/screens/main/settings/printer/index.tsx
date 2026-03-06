import * as React from 'react';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';

export function PrinterSettings() {
	const t = useT();

	// TODO: Read printer profiles from RxDB collection
	const profiles: never[] = [];

	return (
		<VStack className="gap-4">
			{profiles.length === 0 ? (
				<VStack className="items-center gap-4 py-8">
					<Text className="text-muted-foreground">
						{t('settings.no_printers_configured', 'No printers configured')}
					</Text>
					<Text className="text-sm text-muted-foreground">
						{t(
							'settings.printer_setup_description',
							'Add a thermal receipt printer to enable silent printing without the system dialog.',
						)}
					</Text>
					<Button
						onPress={() => {
							// TODO: Open add printer flow
						}}
					>
						<Text>{t('settings.add_printer', 'Add Printer')}</Text>
					</Button>
				</VStack>
			) : (
				<VStack className="gap-2">
					{/* TODO: List configured printers with edit/delete/test buttons */}
				</VStack>
			)}
		</VStack>
	);
}
