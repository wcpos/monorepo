import * as React from 'react';
import { View } from 'react-native';
import Text from '../../text';
import Arrow from '../../arrow';
import Pressable from '../../pressable';
import { JsonNode } from './node';
import * as Styled from './styles';

export interface JsonArrayProps {
	data: any;
	name: string;
	isCollapsed: (keyPath: string[], deep: number, data: any) => boolean;
	onExpand: (keyPath: string[], deep: number, data: any) => void;
	keyPath?: string[];
	deep?: number;
}

export const JsonArray = ({
	data,
	name,
	isCollapsed,
	onExpand,
	keyPath = [],
	deep = 0,
}: JsonArrayProps) => {
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
		const collapseValue = ' [...]';
		const numberOfItems = data.length;
		const itemName = numberOfItems === 0 || numberOfItems > 1 ? 'items' : 'item';

		return (
			<Text type="secondary">
				{collapseValue} {numberOfItems} {itemName}
			</Text>
		);
	};

	const renderNotCollapsed = () => {
		const keyList = Object.getOwnPropertyNames(data);

		const list = data.map((item: any, index: number) => (
			<JsonNode
				key={index}
				name={`${index}`}
				data={item}
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
					<Arrow direction={collapsed ? 'right' : 'down'} />
					<Text type="info">{name} :</Text>
				</Pressable>
				{collapsed ? renderCollapsed() : <Text> [</Text>}
			</View>
			{!collapsed && renderNotCollapsed()}
			{!collapsed && <Text>]</Text>}
		</Styled.ObjectNode>
	);
};
