import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';
import { useObservableEagerState } from 'observable-hooks';
import { isRxDocument, RxDocument } from 'rxdb';

import Form from '@wcpos/react-native-jsonschema-form';

import { EditFormWithJSONTree } from './edit-form-with-json-tree';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';

interface Props {
	document: RxDocument;
	fields: string[];
	uiSchema: any;
	withJSONTree?: boolean;
}

/**
 * A wrapper for the JSON form, which subscribes to changes and patches the document.
 */
export const EditDocumentForm = ({ document, fields, uiSchema, withJSONTree }: Props) => {
	if (!isRxDocument(document)) {
		throw new Error('EditDocumentForm requires an RxDocument');
	}
	const { localPatch } = useLocalMutation();
	const json = useObservableEagerState(document.$).toMutableJSON();

	/**
	 * Get schema
	 */
	const schema = React.useMemo(() => {
		const orderSchema = get(document.collection, 'schema.jsonSchema.properties');
		return {
			properties: pick(orderSchema, fields),
		};
	}, [document, fields]);

	/**
	 * If we want to show the JSON tree
	 */
	if (withJSONTree) {
		return (
			<EditFormWithJSONTree
				json={json}
				schema={schema}
				uiSchema={uiSchema}
				onChange={({ changes }) => localPatch({ document, data: changes })}
			/>
		);
	}

	/**
	 *
	 */
	return (
		<Form
			formData={json}
			schema={schema}
			uiSchema={uiSchema}
			onChange={({ changes }) => localPatch({ document, data: changes })}
		/>
	);
};
