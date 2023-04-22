import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Tree from '@wcpos/components/src/tree';

interface DocumentTreeProps {
	document: import('rxdb').RxDocument;
}

/**
 *
 */
const DocumentTree = ({ document }: DocumentTreeProps) => {
	// Note: we need an epic () => Observable<any> here to stop rerendering
	const [data] = useObservableState(
		() => document.$.pipe(map((doc) => doc.toJSON())),
		document.toJSON()
	);

	return <Tree data={data} />;
};

export default DocumentTree;
