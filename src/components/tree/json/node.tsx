import * as React from 'react';
import { JsonValue } from './value';
import { JsonObject } from './object';
import { JsonArray } from './array';
import { getObjectType } from './utils';

export interface JsonNodeProps {
	data: any;
	name: string;
	isCollapsed?: (keyPath: string[], deep: number, data: any) => boolean;
	onExpand?: (keyPath: string[], deep: number, data: any) => void;
	keyPath?: string[];
	deep?: number;
}

export const JsonNode = ({
	data,
	name,
	isCollapsed = (keyPath: string[]) => keyPath.length > 0,
	onExpand = () => {},
	keyPath = [],
	deep = 0,
}: JsonNodeProps) => {
	const dataType = getObjectType(data);

	switch (dataType) {
		case 'String':
			return (
				<JsonValue
					name={name}
					value={`"${data}"`}
					originalValue={data}
					keyPath={keyPath}
					deep={deep}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			);
		case 'Number':
			return (
				<JsonValue
					name={name}
					value={data}
					originalValue={data}
					keyPath={keyPath}
					deep={deep}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			);
		case 'Boolean':
			return (
				<JsonValue
					name={name}
					value={!!data}
					originalValue={data}
					keyPath={keyPath}
					deep={deep}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			);
		case 'Date':
			return (
				<JsonValue
					name={name}
					value={data.toISOString()}
					originalValue={data}
					keyPath={keyPath}
					deep={deep}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			);
		case 'Null':
			return (
				<JsonValue
					name={name}
					value="null"
					originalValue="null"
					keyPath={keyPath}
					deep={deep}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			);
		case 'Undefined':
			return (
				<JsonValue
					name={name}
					value="undefined"
					originalValue="undefined"
					keyPath={keyPath}
					deep={deep}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			);
		case 'Object':
			return (
				<JsonObject
					name={name}
					data={data}
					keyPath={keyPath}
					deep={deep}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			);
		case 'Array':
			return (
				<JsonArray
					name={name}
					data={data}
					keyPath={keyPath}
					deep={deep}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			);
		default:
			return null;
	}
};
