import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import pick from 'lodash/pick';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Modal, { useModal } from '@wcpos/components/src/modal';
import EditModal from '../../../../common/edit-modal';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

const ProductName = ({ item }: Props) => {
	const name = useObservableState(item.name$, item.name);
	const metaData = useObservableState(item.meta_data$, item.meta_data) || [];
	const { ref: refEditor, open: openEditor, close: closeEditor } = useModal();

	/**
	 *  filter out the private meta data
	 */
	const attributes = metaData.filter((meta) => {
		if (meta.key) {
			return !meta.key.startsWith('_');
		}
		return true;
	});

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...item.collection.schema.jsonSchema,
			properties: pick(item.collection.schema.jsonSchema.properties, [
				'name',
				'sku',
				'price',
				'quantity',
				'tax_class',
				'subtotal',
				'subtotal_tax',
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

	/**
	 *
	 */
	return (
		<Box horizontal>
			<Box fill space="xSmall">
				<Text>{name}</Text>
				{attributes.map((meta) => (
					<Box space="xxSmall" key={meta.key} horizontal>
						<Text size="small" type="secondary">{`${meta.display_key || meta.key}:`}</Text>
						<Text size="small">{meta.display_value || meta.value}</Text>
					</Box>
				))}
			</Box>

			<Icon name="ellipsisVertical" onPress={openEditor} tooltip="Edit" />
			<Modal ref={refEditor} title={`Edit ${name}`}>
				<EditModal schema={schema} uiSchema={uiSchema} item={item} />
			</Modal>
		</Box>
	);
};

export default ProductName;
