import * as React from 'react';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	type DialogFooterProps,
	DialogHeader,
	DialogTitle,
	DismissIsClose,
	type FooterSlot,
} from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';

import { ReceiptBody } from './receipt-body';
import { useT } from '../../../contexts/translations';

import type { useReceiptDocument } from './use-receipt-document';

export type PrintSheetProps = {
	doc: ReturnType<typeof useReceiptDocument>;
	title: string;
	description?: string;
	printLabel: string;
	waiting?: string | null;
	error?: string | null;
	record?: FooterSlot | FooterSlot[];
	secondary?: FooterSlot | FooterSlot[];
	onPrint: () => void | Promise<unknown>;
	side?: 'left' | 'right';
	portalHost?: string;
	testID?: string;
	close?: DialogFooterProps['close'];
	printTestID?: string;
};

export function PrintSheetContent({
	doc,
	title,
	description,
	printLabel,
	waiting,
	error,
	record,
	secondary,
	onPrint,
	side = 'right',
	portalHost,
	testID = 'print-sheet',
	close = true,
	printTestID = 'print-sheet-print',
}: PrintSheetProps) {
	const t = useT();
	return (
		<DialogContent side={side} size="xl" portalHost={portalHost} testID={testID}>
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				{description ? <DialogDescription>{description}</DialogDescription> : null}
			</DialogHeader>
			<DialogBody contentContainerStyle={{ height: '100%' }}>
				<ReceiptBody doc={doc} />
			</DialogBody>
			{waiting ? (
				<Text variant="key" className="px-4" testID="print-sheet-waiting">
					{waiting}
				</Text>
			) : null}
			{error ? (
				<Text variant="key" className="text-bad px-4" testID="print-sheet-error">
					{error}
				</Text>
			) : null}
			{/* A document being looked at is a record shell: the dismiss reads Close beside Print. */}
			<DismissIsClose>
				<DialogFooter
					close={close}
					record={record}
					secondary={secondary}
					intent={{
						label: doc.printedTo ? t('receipt.print_again') : printLabel,
						testID: printTestID,
						icon: 'print',
						onPress: () => void onPrint(),
						disabled: !!waiting || doc.printHeld,
						loading: doc.isPrinting || doc.isSyncing,
					}}
				/>
			</DismissIsClose>
		</DialogContent>
	);
}

export function PrintSheet({
	open,
	onOpenChange,
	...content
}: PrintSheetProps & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<PrintSheetContent {...content} />
		</Dialog>
	);
}
