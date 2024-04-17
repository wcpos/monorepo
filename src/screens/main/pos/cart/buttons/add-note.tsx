import * as React from 'react';
import { TextInput } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Button from '@wcpos/components/src/button';
import Modal, { useModal } from '@wcpos/components/src/modal';
import TextArea from '@wcpos/components/src/textarea';
import type { OrderDocument } from '@wcpos/database';

import { useT } from '../../../../../contexts/translations';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
const AddNote = ({ order, setOpened }) => {
	const note = useObservableState(order.customer_note$, order.customer_note);
	const [value, setValue] = React.useState(note);
	const { setPrimaryAction } = useModal();
	const t = useT();
	const { localPatch } = useLocalMutation();

	React.useEffect(() => {
		setValue(note);
	}, [note]);

	setPrimaryAction({
		label: t('Add Note', { _tags: 'core' }),
		action: async () => {
			await localPatch({
				document: order,
				data: {
					customer_note: value,
				},
			});
			setOpened(false);
		},
	});

	return <TextArea value={value} onChangeText={setValue} autoFocus />;
};

/**
 *
 */
const AddNoteButton = () => {
	const { currentOrder } = useCurrentOrder();
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

			{opened && (
				<Modal
					opened={opened}
					onClose={() => setOpened(false)}
					title={t('Order Note', { _tags: 'core' })}
					// primaryAction={{ label: t('Add Note', { _tags: 'core' }) }}
					secondaryActions={[
						{
							label: t('Cancel', { _tags: 'core' }),
							action: () => setOpened(false),
						},
					]}
				>
					<AddNote order={currentOrder} setOpened={setOpened} />
				</Modal>
			)}
		</>
	);
};

export default AddNoteButton;
