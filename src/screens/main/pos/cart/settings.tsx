import * as React from 'react';

// import validator from '@rjsf/validator-ajv8';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';

import { t } from '../../../../lib/translations';
import useUI from '../../contexts/ui';

/**
 *
 */
const schema = {
	type: 'object',
	properties: {
		columns: {
			// uniqueItems: false,
			title: 'Columns',
			type: 'array',
			items: {
				type: 'object',
				properties: {
					show: {
						type: 'boolean',
					},
					display: {
						title: 'Display',
						type: 'array',
						items: {
							type: 'object',
							properties: {
								show: {
									type: 'boolean',
								},
							},
						},
					},
				},
			},
		},
	},
};

/**
 *
 */
const uiSchema = {
	columns: {
		'ui:options': {
			removable: false,
			addable: false,
		},
		items: {
			display: {
				'ui:collapsible': 'closed',
				'ui:options': {
					removable: false,
					addable: false,
				},
			},
		},
	},
};

/**
 *
 */
export const POSProductSettings = () => {
	const { ui } = useUI('pos.cart');
	const [opened, setOpened] = React.useState(false);
	const showOutOfStock = useObservableState(ui.get$('showOutOfStock'), ui.get('showOutOfStock'));
	const columns = useObservableState(ui.get$('columns'), ui.get('columns'));

	/**
	 * Translate column key into label
	 */
	const label = React.useCallback(
		(id, label) => {
			const path = id.split('.').slice(2, -1);
			const key = get(columns, path.concat('key'), null);

			// root level
			if (!key) {
				switch (label) {
					default:
						return label;
				}
			}

			switch (key) {
				case 'quantity':
					return t('Qty', { _tags: 'core', _context: 'Short for quantity' });
				case 'name':
					return t('Name', { _tags: 'core' });
				case 'sku':
					return t('SKU', { _tags: 'core' });
				case 'price':
					return t('Price', { _tags: 'core' });
				case 'total':
					return t('Total', { _tags: 'core' });
				case 'subtotal':
					return t('Subtotal', { _tags: 'core' });
				case 'tax':
					return t('Tax', { _tags: 'core' });
				case 'actions':
					return t('Actions', { _tags: 'core' });
				default:
					return t('No label found for {key}', { key, _tags: 'core' });
			}
		},
		[columns]
	);

	/**
	 *
	 */
	return (
		<>
			<Icon
				name="sliders"
				onPress={() => {
					setOpened(true);
				}}
			/>
			<Modal
				opened={opened}
				onClose={() => setOpened(false)}
				title={t('Cart Settings', { _tags: 'core' })}
				// primaryAction={{ label: 'Save', action: close }}
				// secondaryActions={[{ label: 'Restore Defaults', action: ui.reset, type: 'critical' }]}
				primaryAction={{
					label: t('Restore Defaults', { _tags: 'core' }),
					action: ui.reset,
					type: 'critical',
				}}
			>
				<Form
					schema={schema}
					uiSchema={uiSchema}
					formData={{ showOutOfStock, columns }}
					onChange={(value) => {
						// debugger;
						ui.incrementalPatch(value);
					}}
					formContext={{ label }}
					// validator={validator}
				/>
			</Modal>
		</>
	);
};

export default POSProductSettings;
