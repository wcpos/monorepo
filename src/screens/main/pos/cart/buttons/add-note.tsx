import * as React from 'react';
import { TextInput } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Button from '@wcpos/components/src/button';
import Modal from '@wcpos/components/src/modal';
import TextArea from '@wcpos/components/src/textarea';
import useFocusTrap from '@wcpos/hooks/src/use-focus-trap';

import { t } from '../../../../../lib/translations';

interface AddNoteButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const AddNoteButton = ({ order }: AddNoteButtonProps) => {
	const [opened, setOpened] = React.useState(false);
	const note = useObservableState(order.customer_note$, order.customer_note);
	const textareaRef = React.useRef<TextInput>(null);

	const handleSaveNote = React.useCallback(() => {
		order.patch({ customer_note: textareaRef.current?.value });
		setOpened(false);
	}, [order, textareaRef]);

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
				primaryAction={{ label: t('Add Note', { _tags: 'core' }), action: handleSaveNote }}
				secondaryActions={[
					{
						label: t('Cancel', { _tags: 'core' }),
						action: () => {
							setOpened(false);
						},
					},
				]}
			>
				<TextArea ref={textareaRef} value={note} />
			</Modal>
		</>
	);
};

export default AddNoteButton;
