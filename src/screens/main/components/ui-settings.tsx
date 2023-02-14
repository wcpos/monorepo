import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';

import { t } from '../../../lib/translations';

interface UiSettingsProps {
	ui: import('../contexts/ui').UIDocument;
	title: string;
}

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

const UISettings = ({ ui, title }: UiSettingsProps) => {
	const columns = useObservableState(ui.get$('columns'), ui.get('columns'));
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
					action: () => ui.reset(ui.id),
					type: 'critical',
				}}
			>
				<Form
					schema={schema}
					uiSchema={uiSchema}
					formData={{ columns }}
					onChange={(value) => {
						ui.incrementalPatch(value);
					}}
					formContext={{ label: ui.getLabel }}
				/>
			</Modal>
		</>
	);
};

export default UISettings;
