import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';
import { useObservablePickState } from 'observable-hooks';
import { isRxDocument, RxDocument } from 'rxdb';
import { distinctUntilChanged } from 'rxjs/operators';

import { EditForm } from './edit-json-form';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';

interface Props {
	document: RxDocument;
	fields: string[];
	uiSchema: any;
}

/**
 * A wrapper for the JSON form, which subscribes to changes and patches the document.
 */
export const EditDocumentForm = ({ document, fields, uiSchema }: Props) => {
	if (!isRxDocument(document)) {
		throw new Error('EditDocumentForm requires an RxDocument');
	}
	const jsonData = useObservablePickState(
		document.$,
		() => {
			return pick(document.toMutableJSON(), fields);
		},
		...fields
	);
	const { localPatch } = useLocalMutation();

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
	 *
	 */
	return (
		<EditForm
			json={jsonData}
			schema={schema}
			uiSchema={uiSchema}
			onChange={({ changes }) => localPatch({ document, data: changes })}
		/>
	);
};
