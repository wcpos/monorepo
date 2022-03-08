import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import TextInput from '@wcpos/common/src/components/textinput';

interface AddNoteButtonProps {
	order: import('@wcpos/common/src/database').OrderDocument;
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
