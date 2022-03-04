import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import TextInput from '@wcpos/common/src/components/textinput';

interface AddNoteButtonProps {
	order: import('@wcpos/common/src/database').OrderDocument;
}

const AddNoteButton = ({ order }: AddNoteButtonProps) => {
	const { ref, open, close } = useModal();

	// order.atomicPatch({ customer_note: 'This is a note!' });

	return (
		<>
			<Button title="Order Meta" background="outline" onPress={open} />
			<Modal ref={ref} title="Edit Order">
				<TextInput label="Order Note" />
			</Modal>
		</>
	);
};

export default AddNoteButton;
