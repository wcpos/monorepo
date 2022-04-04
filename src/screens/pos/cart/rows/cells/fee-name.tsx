import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import pick from 'lodash/pick';
import Text from '@wcpos/common/src/components/text';
import Box from '@wcpos/common/src/components/box';
import Icon from '@wcpos/common/src/components/icon';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import EditModal from '../../../../common/edit-modal';

interface Props {
	item: import('@wcpos/common/src/database').FeeLineDocument;
}

const FeeName = ({ item }: Props) => {
	const name = useObservableState(item.name$, item.name);
	const { ref: refEditor, open: openEditor, close: closeEditor } = useModal();

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...item.collection.schema.jsonSchema,
			properties: pick(item.collection.schema.jsonSchema.properties, [
				'name',
				'tax_class',
				'tax_status',
				'total',
				'total_tax',
				'taxes',
				'meta_data',
			]),
		};
	}, [item.collection.schema.jsonSchema]);

	/**
	 *  uiSchema
	 */
	const uiSchema = React.useMemo(
		() => ({
			taxes: { 'ui:collapsible': 'closed', 'ui:title': 'Taxes' },
			meta_data: { 'ui:collapsible': 'closed', 'ui:title': 'Meta Data' },
		}),
		[]
	);

	return (
		<Box horizontal>
			<Box fill>
				<Text>{name}</Text>
			</Box>

			<Icon name="ellipsisVertical" onPress={openEditor} tooltip="Edit" />
			<Modal ref={refEditor} title={`Edit ${name}`}>
				<EditModal schema={schema} uiSchema={uiSchema} item={item} />
			</Modal>
		</Box>
	);
};

export default FeeName;
