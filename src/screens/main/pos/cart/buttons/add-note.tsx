import * as React from 'react';
import Button from '@wcpos/components/src/button';
import Modal, { useModal } from '@wcpos/components/src/modal';
import TextInput from '@wcpos/components/src/textinput';

interface AddNoteButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

const AddNoteButton = ({ order }: AddNoteButtonProps) => {
	const { ref, open, close } = useModal();
	const [note, setNote] = React.useState('');

	const handleSaveNote = React.useCallback(
		() => order.atomicPatch({ customer_note: note }),
		[note, order]
	);

	return (
		<>
			<Button title="Order Note" background="outline" onPress={open} />
			<Modal
				ref={ref}
				title="Order Note"
				primaryAction={{ label: 'Save', action: handleSaveNote }}
				secondaryActions={[{ label: 'Cancel', action: close }]}
			>
				<TextInput label="Order Note" value={note} onChange={setNote} />
			</Modal>
		</>
	);
};

export default AddNoteButton;
