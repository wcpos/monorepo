import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import pick from 'lodash/pick';
import Text from '@wcpos/common/src/components/text';
import Box from '@wcpos/common/src/components/box';
import Icon from '@wcpos/common/src/components/icon';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import EditModal from '../../../../common/edit-modal';

interface Props {
	item: import('@wcpos/common/src/database').ShippingLineDocument;
}

const ShippingTitle = ({ item }: Props) => {
	const methodTitle = useObservableState(item.method_title$, item.method_title);
	const { ref: refEditor, open: openEditor, close: closeEditor } = useModal();

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...item.collection.schema.jsonSchema,
			properties: pick(item.collection.schema.jsonSchema.properties, [
				'method_title',
				'method_id',
				'instance_id',
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
				<Text>{methodTitle}</Text>
			</Box>

			<Icon name="ellipsisVertical" onPress={openEditor} tooltip="Edit" />
			<Modal ref={refEditor} title={`Edit ${methodTitle}`}>
				<EditModal schema={schema} uiSchema={uiSchema} item={item} />
			</Modal>
		</Box>
	);
};

export default ShippingTitle;
