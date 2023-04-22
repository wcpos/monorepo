import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
// import Tooltip from '@wcpos/components/src/tooltip';

import { t } from '../../../../../lib/translations';
import EditForm from '../../../components/form-with-json';

interface EditFeelLineProps {
	item: import('@wcpos/database').FeeLineDocument;
}

/**
 *
 */
const EditButton = ({ item }: EditFeelLineProps) => {
	const [opened, setOpened] = React.useState(false);

	/**
	 *
	 */
	return (
		<>
			<Icon
				name="ellipsisVertical"
				onPress={() => setOpened(true)}
				tooltip={t('Edit', { _tags: 'core' })}
			/>
			<Modal
				title={t('Edit {name}', { _tags: 'core', name: item.name })}
				size="large"
				opened={opened}
				onClose={() => setOpened(false)}
			>
				<EditForm
					document={item}
					fields={[
						'name',
						'total',
						// 'amount', // amount is weird, it's in the WC REST API, but always returns empty
						'tax_class',
						'tax_status',
						// 'subtotal',
						// 'subtotal_tax',
						// 'total_tax',
						'taxes',
						'meta_data',
					]}
					uiSchema={{
						'ui:title': null,
						'ui:description': null,
						name: {
							'ui:label': t('Name', { _tags: 'core' }),
						},
						total: {
							'ui:label': t('Total', { _tags: 'core' }),
						},
						tax_class: {
							'ui:label': t('Tax Class', { _tags: 'core' }),
						},
						tax_status: {
							'ui:label': t('Tax Status', { _tags: 'core' }),
						},
						taxes: {
							'ui:collapsible': 'closed',
							'ui:title': t('Taxes', { _tags: 'core' }),
							'ui:description': null,
						},
						meta_data: {
							'ui:collapsible': 'closed',
							'ui:title': t('Meta Data', { _tags: 'core' }),
							'ui:description': null,
						},
					}}
				/>
			</Modal>
		</>
	);
};

export default EditButton;
