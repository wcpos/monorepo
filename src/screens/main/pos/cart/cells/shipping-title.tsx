import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import pick from 'lodash/pick';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Modal, { useModal } from '@wcpos/components/src/modal';
import { t } from '@wcpos/core/src/lib/translations';
import EditModal from '../../../common/edit-modal';

interface Props {
	item: import('@wcpos/database').ShippingLineDocument;
}

export const ShippingTitle = ({ item }: Props) => {
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
			taxes: { 'ui:collapsible': 'closed', 'ui:title': t('Taxes') },
			meta_data: { 'ui:collapsible': 'closed', 'ui:title': t('Meta Data') },
		}),
		[]
	);

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill>
				<Text>{methodTitle}</Text>
			</Box>
			<Box distribution="center">
				<Icon name="ellipsisVertical" onPress={openEditor} tooltip={t('Edit')} />
				<Modal ref={refEditor} title={t('Edit {name}', { name: methodTitle })}>
					<EditModal schema={schema} uiSchema={uiSchema} item={item} />
				</Modal>
			</Box>
		</Box>
	);
};
