import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Tabs from '@wcpos/components/src/tabs';
import Tree from '@wcpos/components/src/tree';
import Form from '@wcpos/react-native-jsonschema-form';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const EditForm = ({ json, schema, uiSchema, onChange }) => {
	const [index, setIndex] = React.useState(0);
	const t = useT();

	/**
	 *
	 */
	const renderScene = React.useCallback(
		({ route }) => {
			switch (route.key) {
				case 'form':
					return (
						<Box padding="small">
							<Form schema={schema} uiSchema={uiSchema} formData={json} onChange={onChange} />
						</Box>
					);
				case 'json':
					return <Tree data={json} />;
				default:
					return null;
			}
		},
		[schema, uiSchema, json, onChange]
	);

	/**
	 *
	 */
	const routes = React.useMemo(
		() => [
			{ key: 'form', title: t('Form', { _tags: 'core' }) },
			{ key: 'json', title: t('JSON', { _tags: 'core' }) },
		],
		[t]
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
