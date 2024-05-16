import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';

import { useT } from '../../../contexts/translations';
import { UISettingID, UISettingState, useUISettings } from '../contexts/ui-settings';

interface Props<T extends UISettingID> {
	uiSettings: UISettingState<T>;
	title: string;
}

const uiSchema = {
	columns: {
		'ui:options': {
			removable: false,
			addable: false,
			border: false,
			padding: 'none',
		},
		items: {
			display: {
				// 'ui:collapsible': 'closed',
				'ui:indent': true,
				'ui:options': {
					removable: false,
					addable: false,
					border: false,
					padding: 'none',
				},
			},
		},
	},
};

/**
 *
 */
const UISettings = <T extends UISettingID>({ uiSettings, title }: Props<T>) => {
	const formData = useObservableState(uiSettings.$, uiSettings.get());
	const { getUILabel, resetUI, patchUI } = useUISettings(uiSettings.prefix);
	const [opened, setOpened] = React.useState(false);
	const t = useT();

	/**
	 * Hack to add out-of-stock to Products
	 * TODO: I need to create a Column Class that can be extended
	 */
	const schema = React.useMemo(() => {
		const _schema = {
			type: 'object',
			properties: {
				// sortBy: {
				// 	type: 'string',
				// },
				// sortDirection: {
				// 	type: 'string',
				// 	enum: ['asc', 'desc'],
				// 	enumNames: ['Ascending', 'Descending'],
				// },

				columns: {
					// uniqueItems: false,
					title: t('Columns', { _tags: 'core' }),
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

		if (uiSettings.prefix === 'pos-products') {
			return {
				..._schema,
				properties: {
					showOutOfStock: {
						type: 'boolean',
					},
					..._schema.properties,
				},
			};
		}

		if (uiSettings.prefix === 'pos-cart') {
			return {
				..._schema,
				properties: {
					quickDiscounts: {
						type: 'string',
					},
					..._schema.properties,
				},
			};
		}

		return _schema;
	}, [t, uiSettings.prefix]);

	/**
	 *
	 */
	return (
		<>
			<Icon name="sliders" onPress={() => setOpened(true)} />
			{opened && (
				<Modal
					title={title}
					opened
					onClose={() => {
						setOpened(false);
					}}
					primaryAction={{
						label: t('Restore Default Settings', { _tags: 'core' }),
						action: resetUI,
						type: 'critical',
					}}
				>
					<Form
						schema={schema}
						uiSchema={uiSchema}
						formData={formData}
						onChange={({ changes }) => patchUI(changes)}
						formContext={{
							/**
							 * Turns schema path into a label
							 */
							label: (jsonSchemaPath, key) => {
								// special case for common labels
								if (key === 'sortBy') {
									return t('Sort by', { _tags: 'core' });
								}
								if (key === 'sortDirection') {
									return t('Sort direction', { _tags: 'core' });
								}

								// root
								const path = jsonSchemaPath.split('.').slice(2, -1);
								if (path.length === 0) {
									return getUILabel(key);
								}

								// nested columns
								const columnKey = get(uiSettings.columns, path.concat('key'), null);
								const label = getUILabel(columnKey);
								return label;
							},
						}}
					/>
				</Modal>
			)}
		</>
	);
};

export default UISettings;
