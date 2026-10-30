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
	error?: React.ReactNode;
	record?: FooterSlot | FooterSlot[];
	secondary?: FooterSlot | FooterSlot[];
	onPrint: () => void | Promise<unknown>;
	side?: 'left' | 'right';
	portalHost?: string;
	testID?: string;
	close?: DialogFooterProps['close'];
	aside?: DialogFooterProps['aside'];
	fullWidth?: boolean;
	footerTestID?: string;
	/** Nested dialogs (the receipt's email sheet) render inside the content, never beside it. */
	children?: React.ReactNode;
	printTestID?: string;
};

export function PrintSheetContent({
	side = 'right',
	portalHost,
	testID = 'print-sheet',
	...inner
}: PrintSheetProps) {
	return (
		<DialogContent side={side} size="xl" portalHost={portalHost} testID={testID}>
			<PrintSheetInner {...inner} />
		</DialogContent>
	);
}

export function PrintSheetInner({
	doc,
	title,
	description,
	printLabel,
	waiting,
	error,
	record,
	secondary,
	onPrint,
	aside,
	fullWidth,
	footerTestID,
	header,
	close = true,
	printTestID = 'print-sheet-print',
	children,
}: Omit<PrintSheetProps, 'side' | 'portalHost' | 'testID'> & { header?: React.ReactNode }) {
	const t = useT();
	return (
		<>
			{header ?? (
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? <DialogDescription>{description}</DialogDescription> : null}
				</DialogHeader>
			)}
			<DialogBody contentContainerStyle={fullWidth ? { minHeight: '100%' } : { height: '100%' }}>
				<ReceiptBody doc={doc} fullWidth={fullWidth} />
			</DialogBody>
			{waiting ? (
				<Text variant="key" className="px-4" testID="print-sheet-waiting">
					{waiting}
				</Text>
			) : null}
			{error ? (
				typeof error === 'string' ? (
					<Text variant="key" className="text-bad px-4" testID="print-sheet-error">
						{error}
					</Text>
				) : (
					error
				)
			) : null}
			{/* A document being looked at is a record shell: the dismiss reads Close beside Print. */}
			<DismissIsClose>
				<DialogFooter
					testID={footerTestID}
					aside={aside}
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
			{children}
		</>
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
