import * as React from 'react';
import { JsonObject } from './object';
import { JsonValue } from './value';
import { getObjectType } from './utils';

export interface JsonNodeProps {
	data: any;
	name: string;
}

export const JsonNode = ({ data, name = 'root' }: JsonNodeProps) => {
	const dataType = getObjectType(data);

	switch (dataType) {
		case 'Object':
			return <JsonObject name={name} data={data} />;
		case 'String':
			return <JsonValue name={name} value={`"${data}"`} originalValue={data} />;
		default:
			return null;
	}
};
