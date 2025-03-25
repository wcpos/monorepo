'use dom';

import JsonView, { JsonViewProps } from '@uiw/react-json-view';

import type { DOMProps } from 'expo/dom';

interface TreeDOMProps<T extends object> extends JsonViewProps<T> {
	dom?: DOMProps;
	width?: number;
	height?: number;
}

export default function TreeDOM<T extends object>(props: TreeDOMProps<T>) {
	return <JsonView displayDataTypes={false} collapsed={1} {...props} />;
}
