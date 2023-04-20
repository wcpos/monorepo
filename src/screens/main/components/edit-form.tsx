import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Tabs from '@wcpos/components/src/tabs';
import Tree from '@wcpos/components/src/tree';
import Form from '@wcpos/react-native-jsonschema-form';

import { t } from '../../../lib/translations';

export interface EditModalProps {
	formData: Record<string, any>;
	schema: import('json-schema').JSONSchema7;
	uiSchema: Record<string, any>;
	onChange: (data: Record<string, any>) => void;
}

/**
 *
 */
const EditForm = ({ schema, uiSchema, onChange, ...props }: EditModalProps) => {
	const [formData, setFormData] = React.useState(props.formData);
	const [index, setIndex] = React.useState(0);

	/**
	 *
	 */
	const handleChange = React.useCallback(
		(newData) => {
			setFormData(newData);
			onChange && onChange(newData);
		},
		[onChange]
	);

	/**
	 *
	 */
	const renderScene = React.useCallback(
		({ route }) => {
			switch (route.key) {
				case 'form':
					return (
						<Box padding="small">
							<Form
								schema={schema}
								formData={formData}
								uiSchema={uiSchema}
								onChange={handleChange}
							/>
						</Box>
					);
				case 'json':
					return <Tree data={formData} />;
				default:
					return null;
			}
		},
		[formData, handleChange, schema, uiSchema]
	);

	/**
	 *
	 */
	const routes = React.useMemo(
		() => [
			{ key: 'form', title: t('Form', { _tags: 'core' }) },
			{ key: 'json', title: t('JSON', { _tags: 'core' }) },
		],
		[]
	);

	/**
	 *
	 */
	return (
		<Tabs<(typeof routes)[number]>
			navigationState={{ index, routes }}
			renderScene={renderScene}
			onIndexChange={setIndex}
		/>
	);
};

export default EditForm;
