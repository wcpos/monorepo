'use dom';

import * as React from 'react';

import type { JsonViewProps } from '@uiw/react-json-view';
import type { DOMProps } from 'expo/dom';

const JsonView = React.lazy(() => import('@uiw/react-json-view'));

interface TreeDOMProps<T extends object> extends JsonViewProps<T> {
	dom?: DOMProps;
	width?: number;
	height?: number;
}

export default function TreeDOM<T extends object>({
	dom: _dom,
	width: _width,
	height: _height,
	...props
}: TreeDOMProps<T>) {
	return (
		<React.Suspense fallback={null}>
			<JsonView displayDataTypes={false} collapsed={1} {...(props as JsonViewProps<object>)} />
		</React.Suspense>
	);
}
