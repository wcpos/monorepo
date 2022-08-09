import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import Popover from '@wcpos/components/src/popover';
import Icon from '@wcpos/components/src/icon';
import Button from '@wcpos/components/src/button';
import Form from '@wcpos/react-native-jsonschema-form';

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
	const { t } = useTranslation();
	const columns = useObservableState(ui.get$('columns'), ui.get('columns'));

	/**
	 * Translate column key into label
	 */
	const label = React.useCallback(
		(id) => {
			// remove rootId and 'show'
			const path = id.split('.').slice(1, -1).concat('key');
			const key = get(columns, path, null);
			if (key) {
				return t(`${ui.id}.column.label.${key}`);
			}
			return 'No label found';
		},
		[columns, t, ui]
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
