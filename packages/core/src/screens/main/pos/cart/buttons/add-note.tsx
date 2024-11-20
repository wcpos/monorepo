import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Button } from '@wcpos/components/src/button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
	DialogFooter,
	DialogClose,
	DialogAction,
} from '@wcpos/components/src/dialog';
import { Textarea } from '@wcpos/components/src/textarea';

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
				<Button variant="outline">{t('Order Note', { _tags: 'core' })}</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t('Order Note', { _tags: 'core' })}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Textarea autoFocus value={text} minHeight={80} onChangeText={onChangeText} />
				</DialogBody>
				<DialogFooter>
					<DialogClose>{t('Cancel', { _tags: 'core' })}</DialogClose>
					<DialogAction onPress={handleSave}>{t('Add Note', { _tags: 'core' })}</DialogAction>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
