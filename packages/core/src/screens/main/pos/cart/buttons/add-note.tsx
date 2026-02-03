import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

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

import { useT } from '../../../../../contexts/translations';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const AddNoteButton = () => {
	const { currentOrder } = useCurrentOrder();
	const note = useObservableEagerState(currentOrder.customer_note$);
	const t = useT();
	const { localPatch } = useLocalMutation();
	const [open, setOpen] = React.useState(false);
	const [text, onChangeText] = React.useState(note);

	/**
	 * Keep text in sync with note
	 */
	React.useEffect(() => {
		onChangeText(note);
	}, [note]);

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		await localPatch({
			document: currentOrder,
			data: {
				customer_note: text,
			},
		});
		setOpen(false);
	}, [currentOrder, localPatch, text]);

	/**
	 *
	 */
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">{t('Order Note')}</Button>
			</DialogTrigger>
			<DialogContent portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('Order Note')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Textarea autoFocus value={text} minHeight={80} onChangeText={onChangeText} />
				</DialogBody>
				<DialogFooter>
					<DialogClose>{t('Cancel')}</DialogClose>
					<DialogAction onPress={handleSave}>{t('Add Note')}</DialogAction>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
