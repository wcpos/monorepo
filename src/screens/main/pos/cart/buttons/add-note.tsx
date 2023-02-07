import * as React from 'react';

import Button from '@wcpos/components/src/button';
import Modal from '@wcpos/components/src/modal';
import TextInput from '@wcpos/components/src/textinput';

import { t } from '../../../../../lib/translations';

interface AddNoteButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const AddNoteButton = ({ order }: AddNoteButtonProps) => {
	const [opened, setOpened] = React.useState(false);
	const [note, setNote] = React.useState('');

	const handleSaveNote = React.useCallback(
		() => order.patch({ customer_note: note }),
		[note, order]
	);

	return (
		<>
			<Button
				title={t('Order Note', { _tags: 'core' })}
				background="outline"
				onPress={() => {
					setOpened(true);
				}}
				style={{ flex: 1 }}
			/>

			<Modal
				opened={opened}
				onClose={() => {
					setOpened(false);
				}}
				title={t('Order Note', { _tags: 'core' })}
				primaryAction={{ label: t('Save', { _tags: 'core' }), action: handleSaveNote }}
				secondaryActions={[
					{
						label: t('Cancel', { _tags: 'core' }),
						action: () => {
							setOpened(false);
						},
					},
				]}
			>
				<TextInput label={t('Order Note', { _tags: 'core' })} value={note} onChange={setNote} />
			</Modal>
		</>
	);
};

export default AddNoteButton;
