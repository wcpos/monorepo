import * as React from 'react';
import { View } from 'react-native';
import Text from '../../text';
import Arrow from '../../arrow';
import Pressable from '../../pressable';
import { JsonNode } from './node';
import * as Styled from './styles';

export interface JsonObjectProps {
	data: any;
	name: string;
	isCollapsed: (keyPath: string[], deep: number, data: any) => boolean;
	onExpand: (keyPath: string[], deep: number, data: any) => void;
	keyPath?: string[];
	deep?: number;
}

export const JsonObject = ({
	data,
	name,
	isCollapsed,
	onExpand,
	keyPath = [],
	deep = 0,
}: JsonObjectProps) => {
	const _keyPath = deep === -1 ? [] : [...keyPath, name];
	const nextDeep = deep + 1;
	const [collapsed, setCollapsed] = React.useState(isCollapsed(_keyPath, deep, data));

	const handleCollapse = () => {
		if (collapsed) {
			onExpand(_keyPath, deep, data);
		}
		setCollapsed(!collapsed);
	};

	const renderCollapsed = () => {
		const keyList = Object.getOwnPropertyNames(data);
		const collapseValue = ' {...}';
		const numberOfItems = keyList.length;
		const itemName = numberOfItems === 0 || numberOfItems > 1 ? 'keys' : 'key';

		return (
			<Text type="secondary">
				{collapseValue} {numberOfItems} {itemName}
			</Text>
		);
	};

	const renderNotCollapsed = () => {
		const keyList = Object.getOwnPropertyNames(data);

		const list = keyList.map((key) => (
			<JsonNode
				key={key}
				name={key}
				data={data[key]}
				keyPath={_keyPath}
				deep={nextDeep}
				isCollapsed={isCollapsed}
				onExpand={onExpand}
			/>
		));

		return <View>{list}</View>;
	};

	return (
		<Styled.ObjectNode>
			<View style={{ flexDirection: 'row' }}>
				<Pressable onPress={handleCollapse} style={{ flexDirection: 'row', alignItems: 'center' }}>
					<Arrow size="small" direction={collapsed ? 'right' : 'down'} />
					<Text type="info">{name} :</Text>
				</Pressable>
				{collapsed ? renderCollapsed() : <Text>{' {'}</Text>}
			</View>
			{!collapsed && renderNotCollapsed()}
			{!collapsed && <Text>{'}'}</Text>}
		</Styled.ObjectNode>
	);
};
