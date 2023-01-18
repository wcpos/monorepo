import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';

import { t } from '../../../lib/translations';

interface UiSettingsProps {
	ui: import('../../../contexts/ui').UIDocument;
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
	const [opened, setOpened] = React.useState(false);

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
					return t('No label found', { _tags: 'core' });
			}
		},
		[columns]
	);

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
				onClose={() => {
					setOpened(false);
				}}
				primaryAction={{ label: t('Restore Default Settings', { _tags: 'core' }) }}
			>
				<Form
					schema={schema}
					uiSchema={uiSchema}
					formData={columns}
					onChange={(value) => {
						ui.atomicPatch({ columns: value });
					}}
					formContext={{ label }}
				/>
			</Modal>
		</>
	);
};

export default UiSettings;
