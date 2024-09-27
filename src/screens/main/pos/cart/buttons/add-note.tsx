import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogBody,
	DialogFooter,
} from '@wcpos/components/src/dialog';
import { Text } from '@wcpos/components/src/text';
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
				<Button variant="outline">
					<ButtonText numberOfLines={1}>{t('Order Note', { _tags: 'core' })}</ButtonText>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Text>{t('Order Note', { _tags: 'core' })}</Text>
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Textarea autoFocus value={text} minHeight={80} onChangeText={onChangeText} />
				</DialogBody>
				<DialogFooter>
					<Button onPress={handleSave}>
						<ButtonText>{t('Add Note', { _tags: 'core' })}</ButtonText>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
