import * as React from 'react';
import Text from '../../text';

export interface JsonValueProps {
	name: string;
	value: any;
	originalValue: any;
	keyPath?: string[];
	deep?: number;
	isCollapsed: (keyPath: string[], deep: number, data: any) => boolean;
	onExpand: (keyPath: string[], deep: number, data: any) => void;
}

export const JsonValue = ({ name, value, keyPath = [], deep = 0 }: JsonValueProps) => {
	return (
		<Text>
			{name} : {String(value)}
		</Text>
	);
};
