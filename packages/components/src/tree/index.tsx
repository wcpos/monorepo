import type { JsonViewProps } from '@uiw/react-json-view';

import TreeDOM from './tree-dom';

/**
 *
 */
export const Tree = <T extends object>(props: JsonViewProps<T>) => {
	return <TreeDOM dom={{ matchContents: true, containerStyle: { width: '100%' } }} {...props} />;
};
