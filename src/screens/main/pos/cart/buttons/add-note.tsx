import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Button from '@wcpos/components/src/button';
import Modal from '@wcpos/components/src/modal';
import TextArea from '@wcpos/components/src/textarea';

import { useT } from '../../../../../contexts/translations';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 * Note Textarea
 */
const NoteTextarea = ({ note, noteRef }) => {
	const [value, setValue] = React.useState(note);

	const handleChangeText = React.useCallback(
		(val) => {
			setValue(val);
			noteRef.current = val;
		},
		[noteRef]
	);

	return <TextArea value={value} onChangeText={handleChangeText} autoFocus />;
};

/**
 *
 */
const AddNoteModal = ({ onClose }: { onClose: () => void }) => {
	const { currentOrder } = useCurrentOrder();
	const note = useObservableEagerState(currentOrder.customer_note$);
	const noteRef = React.useRef(note);
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		await localPatch({
			document: currentOrder,
			data: {
				customer_note: noteRef.current,
			},
		});
		onClose();
	}, [currentOrder, localPatch, onClose]);

	/**
	 *
	 */
	return (
		<Modal
			opened
			onClose={onClose}
			title={t('Order Note', { _tags: 'core' })}
			primaryAction={{
				label: t('Add Note', { _tags: 'core' }),
				action: handleSave,
			}}
			secondaryActions={[
				{
					label: t('Cancel', { _tags: 'core' }),
					action: onClose,
				},
			]}
		>
			<NoteTextarea note={note} noteRef={noteRef} />
		</Modal>
	);
};

/**
 *
 */
export const AddNoteButton = () => {
	const [opened, setOpened] = React.useState(false);
	const t = useT();

	/**
	 *
	 */
	return (
		<>
			<Button
				title={t('Order Note', { _tags: 'core' })}
				background="outline"
				onPress={() => setOpened(true)}
				style={{ flex: 1 }}
			/>
			{opened && <AddNoteModal onClose={() => setOpened(false)} />}
		</>
	);
};
