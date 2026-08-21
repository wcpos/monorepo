import * as React from 'react';

import { Button } from '@wcpos/components/button';
import {
	Dialog,
	DialogAction,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import { Textarea } from '@wcpos/components/textarea';
import { useRecordField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../../contexts/translations';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 *
 */
export function AddNoteButton() {
	const { currentOrderRecord } = useCurrentOrder();
	const note = useRecordField(currentOrderRecord, (order) => order.payload.customer_note);
	const t = useT();
	const { localPatch } = useLocalMutation();
	const [open, setOpen] = React.useState(false);
	const [text, onChangeText] = React.useState(note);

	// Keep text in sync with note. Implemented as the React "adjust state during
	// render" pattern (tracking the previous note value) rather than an effect, so
	// it never sets state inside useEffect.
	const [prevNote, setPrevNote] = React.useState(note);
	if (note !== prevNote) {
		setPrevNote(note);
		onChangeText(note);
	}

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		const result = await localPatch({
			document: currentOrderRecord,
			data: {
				customer_note: text,
			},
		});
		if (!result) return;
		cartLogger.info('Order note updated', {
			context: {
				event: 'cart.order-note.updated',
				orderId: currentOrderRecord.uuid ?? currentOrderRecord.payload.id,
			},
		});
		setOpen(false);
	}, [currentOrderRecord, localPatch, text]);

	/**
	 *
	 */
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button testID="order-note-button" variant="outline">
					{t('pos_cart.order_note')}
				</Button>
			</DialogTrigger>
			<DialogContent testID="order-note-dialog" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('pos_cart.order_note')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Textarea
						testID="order-note-input"
						autoFocus
						value={text}
						minHeight={80}
						onChangeText={onChangeText}
					/>
				</DialogBody>
				<DialogFooter>
					<DialogClose>{t('common.cancel')}</DialogClose>
					<DialogAction testID="add-note-button" onPress={handleSave}>
						{t('pos_cart.add_note')}
					</DialogAction>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
