import JsonView, { JsonViewProps } from '@uiw/react-json-view';

/**
 *
 */
export const Tree = <T extends object>(props: JsonViewProps<T>) => {
	return <JsonView displayDataTypes={false} {...props} />;
};
