import * as React from 'react';

import Button from '@wcpos/components/src/button';
import Modal, { useModal } from '@wcpos/components/src/modal';
import TextInput from '@wcpos/components/src/textinput';

import { t } from '../../../../../lib/translations';

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
			<Button title={t('Order Note')} background="outline" onPress={open} />
			<Modal
				ref={ref}
				title={t('Order Note')}
				primaryAction={{ label: t('Save'), action: handleSaveNote }}
				secondaryActions={[{ label: t('Cancel'), action: close }]}
			>
				<TextInput label={t('Order Note')} value={note} onChange={setNote} />
			</Modal>
		</>
	);
};

export default AddNoteButton;
