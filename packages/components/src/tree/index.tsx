import TreeDOM from './tree-dom';

/**
 *
 */
export const Tree = <T extends object>(props: JsonViewProps<T>) => {
	return <TreeDOM dom={{ matchContents: true }} {...props} />;
};
