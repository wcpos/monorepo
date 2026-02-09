import TreeDOM from './tree-dom';

import type { JsonViewProps } from '@uiw/react-json-view';

/**
 *
 */
export const Tree = <T extends object>(props: JsonViewProps<T>) => {
	return <TreeDOM dom={{ matchContents: true, containerStyle: { width: '100%' } }} {...props} />;
};
