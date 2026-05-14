import * as React from 'react';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Form, FormField, FormInput } from '@wcpos/components/form';
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
	isEditing: boolean;
	banner?: React.ReactNode;
	connectionSection: React.ReactNode;
	advancedSettings: React.ReactNode;
	footer: React.ReactNode;
}

export function PrinterDialogLayout({
	form,
	open,
	onOpenChange,
	isEditing,
	banner,
	connectionSection,
	advancedSettings,
	footer,
}: PrinterDialogLayoutProps) {
	const t = useT();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>
						{isEditing
							? t('settings.edit_printer', 'Edit Printer')
							: t('settings.add_printer', 'Add Printer')}
					</DialogTitle>
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
									<FormInput
										testID="add-printer-name-input"
										label={t('settings.printer_name', 'Printer Name')}
										placeholder={t('settings.printer_name_placeholder', 'e.g. Receipt Printer')}
										{...field}
									/>
								)}
							/>
							{connectionSection}
							{advancedSettings}
							<PrinterToggleGroup form={form} />
						</VStack>
					</Form>
				</DialogBody>
				<DialogFooter>{footer}</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
