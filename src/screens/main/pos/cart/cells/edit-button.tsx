import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import { t } from '../../../../../lib/translations';
import EditForm, { EditModalProps } from '../../../components/edit-form';

type EditButtonProps = EditModalProps;

/**
 *
 */
export const EditButton = ({ schema, uiSchema, item }: EditButtonProps) => {
	const [opened, setOpened] = React.useState(false);

	return (
		<>
			<Icon
				name="ellipsisVertical"
				onPress={() => {
					setOpened(true);
				}}
				tooltip={t('Edit', { _tags: 'core' })}
			/>
			<Modal
				opened={opened}
				onClose={() => {
					setOpened(false);
				}}
			>
				<EditForm schema={schema} uiSchema={uiSchema} item={item} />
			</Modal>
		</>
	);
};
