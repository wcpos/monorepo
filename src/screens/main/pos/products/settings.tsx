import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import Form from '@wcpos/react-native-jsonschema-form';
import Modal, { useModal } from '@wcpos/components/src/modal';
import Icon from '@wcpos/components/src/icon';

interface POSProductSettingsProps {
	ui: import('@wcpos/hooks/src/use-store').UIDocument;
}

/**
 *
 */
const schema = {
	title: 'Product Table Settings',
	type: 'object',
	properties: {
		showOutOfStock: {
			type: 'boolean',
		},
		columns: {
			title: 'Table Columns',
			type: 'array',
			items: {
				type: 'object',
				properties: {
					show: {
						type: 'boolean',
					},
					display: {
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
export const POSProductSettings = ({ ui }: POSProductSettingsProps) => {
	const { ref, open, close } = useModal();
	const { t } = useTranslation();
	const showOutOfStock = useObservableState(ui.get$('showOutOfStock'), ui.get('showOutOfStock'));
	const columns = useObservableState(ui.get$('columns'), ui.get('columns'));

	/**
	 * Translate column key into label
	 */
	const label = React.useCallback(
		(id, label) => {
			// remove rootId and 'show'
			const path = id.split('.').slice(2, -1);
			if (path.length === 0) {
				return t(`${ui.id}.${label}`);
			}

			const key = get(columns, path.concat('key'), null);
			if (key) {
				return t(`${ui.id}.column.label.${key}`);
			}
			return 'No label found';
		},
		[columns, t, ui]
	);

	/**
	 *
	 */
	return (
		<>
			<Icon name="sliders" onPress={open} />
			<Modal
				ref={ref}
				title="Product UI Settings"
				// primaryAction={{ label: 'Save', action: close }}
				// secondaryActions={[{ label: 'Restore Defaults', action: ui.reset, type: 'critical' }]}
				primaryAction={{ label: 'Restore Defaults', action: ui.reset, type: 'critical' }}
			>
				<Form
					schema={schema}
					uiSchema={uiSchema}
					formData={{ showOutOfStock, columns }}
					onChange={(value) => {
						ui.atomicPatch(value);
					}}
					formContext={{ label }}
				/>
			</Modal>
		</>
	);
};

export default POSProductSettings;
