import * as React from 'react';
import { View } from 'react-native';
import Text from '../../text';
import { JsonNode } from './node';
import * as Styled from './styles';

export interface JsonObjectProps {
	data: any;
	name: string;
	isCollapsed?: boolean;
}

export const JsonObject = ({ data, name, isCollapsed = false }: JsonObjectProps) => {
	const [collapsed, setCollapsed] = React.useState(isCollapsed);

	const renderCollapsed = () => {
		return <Text>Collapsed</Text>;
	};

	const renderNotCollapsed = () => {
		const keyList = Object.getOwnPropertyNames(data);

		const list = keyList.map((key) => <JsonNode key={key} name={key} data={data[key]} />);

		return <View style={{ paddingLeft: '20px' }}>{list}</View>;
	};

	return (
		<Styled.ObjectNode>
			<Text>{name} :</Text>
			{collapsed ? renderCollapsed() : renderNotCollapsed()}
		</Styled.ObjectNode>
	);
};
