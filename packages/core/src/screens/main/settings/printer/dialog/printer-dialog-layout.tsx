import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	type DialogFooterProps,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Form, FormField, FormInput, FormItem, FormLabel, SavedMark } from '@wcpos/components/form';
import { VStack } from '@wcpos/components/vstack';

import { PrinterToggleGroup } from './printer-toggle-group';
import { FormErrors } from '../../../components/form-errors';
import { useT } from '../../../../../contexts/translations';

import type { PrinterFormValues } from '../schema';
import type { UseFormReturn } from 'react-hook-form';

interface PrinterDialogLayoutProps {
	form: UseFormReturn<PrinterFormValues>;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	banner?: React.ReactNode;
	connectionSection: React.ReactNode;
	advancedSettings: React.ReactNode;
	/** Test failure alert, rendered inside the form body above the footer. */
	errorSection?: React.ReactNode;
	footer: DialogFooterProps;
}

export function PrinterDialogLayout({
	form,
	open,
	onOpenChange,
	banner,
	connectionSection,
	advancedSettings,
	errorSection,
	footer,
}: PrinterDialogLayoutProps) {
	const t = useT();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side="right" size="2xl" closeLabel={t('common.close')}>
				<DialogHeader>
					<DialogTitle>{t('settings.edit_printer')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Form {...form}>
						<VStack className="gap-4">
							<FormErrors />
							{banner}
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<HStack className="justify-between">
											<FormLabel>{t('settings.printer_name')}</FormLabel>
											<SavedMark name="name" label={t('settings.saved')} />
										</HStack>
										<FormInput
											testID="add-printer-name-input"
											placeholder={t('settings.printer_name_placeholder')}
											{...field}
										/>
									</FormItem>
								)}
							/>
							{connectionSection}
							{advancedSettings}
							<PrinterToggleGroup form={form} />
							{errorSection}
						</VStack>
					</Form>
				</DialogBody>
				<DialogFooter {...footer} />
			</DialogContent>
		</Dialog>
	);
}
