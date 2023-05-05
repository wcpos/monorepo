import * as React from 'react';
import { TextInput } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Button from '@wcpos/components/src/button';
import Modal from '@wcpos/components/src/modal';
import TextArea from '@wcpos/components/src/textarea';
import useFocusTrap from '@wcpos/hooks/src/use-focus-trap';

import { t } from '../../../../../lib/translations';
import useCurrentOrder from '../../contexts/current-order';

/**
 *
 */
const AddNoteButton = () => {
	const [opened, setOpened] = React.useState(false);
	const { currentOrder } = useCurrentOrder();
	const note = useObservableState(currentOrder.customer_note$, currentOrder.customer_note);
	const [value, setValue] = React.useState(note);

	/**
	 * Keep textarea value insync with the order.customer_note
	 */
	React.useEffect(() => {
		setValue(note);
	}, [note]);

	/**
	 *
	 */
	const handleSaveNote = React.useCallback(() => {
		const latestDoc = currentOrder.getLatest();
		latestDoc.patch({ customer_note: value });
		setOpened(false);
	}, [currentOrder, value]);

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

			<Modal
				opened={opened}
				onClose={() => setOpened(false)}
				title={t('Order Note', { _tags: 'core' })}
				primaryAction={{ label: t('Add Note', { _tags: 'core' }), action: handleSaveNote }}
				secondaryActions={[
					{
						label: t('Cancel', { _tags: 'core' }),
						action: () => setOpened(false),
					},
				]}
			>
				<TextArea value={value} onChangeText={setValue} />
			</Modal>
		</>
	);
};

export default AddNoteButton;
