import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import Popover from '@wcpos/components/src/popover';
import Icon from '@wcpos/components/src/icon';
import Button from '@wcpos/components/src/button';
import Form from '@wcpos/react-native-jsonschema-form';
import { t } from '@wcpos/core/src/lib/translations';

interface UiSettingsProps {
	ui: import('@wcpos/hooks/src/use-store').UIDocument;
}

const schema = {
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
};

const uiSchema = {
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
};

const UiSettings = ({ ui }: UiSettingsProps) => {
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
				default:
					return t('No label found');
			}
		},
		[columns]
	);

	const settings = (
		<>
			<Form
				schema={schema}
				uiSchema={uiSchema}
				formData={columns}
				onChange={(value) => {
					ui.atomicPatch({ columns: value });
				}}
				formContext={{ label }}
			/>
			<Button title="Restore Default Settings" onPress={ui.reset} />
		</>
	);

	return (
		<Popover content={settings} placement="bottom-end">
			<Icon name="sliders" />
		</Popover>
	);
};

export default UiSettings;
