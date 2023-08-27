import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Tabs from '@wcpos/components/src/tabs';

import Form, { DocumentFormProps } from './document-form';
import DocumentTree from './document-tree';
import { useT } from '../../../contexts/translations';

export type FormWithJSONProps = DocumentFormProps;

/**
 *
 */
const FormWithJSON = ({ document, fields, uiSchema, ...props }: FormWithJSONProps) => {
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
							<Form document={document} fields={fields} uiSchema={uiSchema} />
						</Box>
					);
				case 'json':
					return <DocumentTree document={document} />;
				default:
					return null;
			}
		},
		[document, fields, uiSchema]
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

export default FormWithJSON;
