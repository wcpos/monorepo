import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';

import { t } from '../../../lib/translations';

interface UiSettingsProps {
	uiSettings: import('../contexts/ui-settings').UISettingsDocument;
	title: string;
}

const schema = {
	type: 'object',
	properties: {
		sortBy: {
			type: 'string',
		},
		sortDirection: {
			type: 'string',
			enum: ['asc', 'desc'],
			enumNames: ['Ascending', 'Descending'],
		},

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

const uiSchema = {
	columns: {
		'ui:options': {
			removable: false,
			addable: false,
		},
		items: {
			display: {
				// 'ui:collapsible': 'closed',
				'ui:indent': true,
				'ui:options': {
					removable: false,
					addable: false,
				},
			},
		},
	},
};

const UISettings = ({ uiSettings, title }: UiSettingsProps) => {
	const formData = uiSettings.toJSON().data;
	const [opened, setOpened] = React.useState(false);

	return (
		<>
			<Icon
				name="sliders"
				onPress={() => {
					setOpened(true);
				}}
			/>
			<Modal
				title={title}
				opened={opened}
				onClose={() => {
					setOpened(false);
				}}
				primaryAction={{
					label: t('Restore Default Settings', { _tags: 'core' }),
					action: () => uiSettings.reset(uiSettings.id),
					type: 'critical',
				}}
			>
				<Form
					schema={schema}
					uiSchema={uiSchema}
					formData={formData}
					onChange={(value) => {
						uiSettings.incrementalPatch(value);
					}}
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
								return uiSettings.getLabel(key);
							}

							// nested columns
							const columnKey = get(uiSettings.get('columns'), path.concat('key'), null);
							const label = uiSettings.getLabel(columnKey);
							return label;
						},
					}}
				/>
			</Modal>
		</>
	);
};

export default UISettings;
