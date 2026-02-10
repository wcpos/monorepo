import TreeDOM from './tree-dom';

import type { JsonViewProps } from '@uiw/react-json-view';

/**
 *
 */
export function Tree<T extends object>(props: JsonViewProps<T>) {
	return <TreeDOM dom={{ matchContents: true, containerStyle: { width: '100%' } }} {...props} />;
}
