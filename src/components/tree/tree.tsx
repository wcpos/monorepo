import * as React from 'react';
import { Raw } from './raw';
import { JsonNode } from './json/node';
import Button from '../button';
import Icon from '../icon';
import Box from '../box';
import * as Styled from './styles';

export interface TreeProps {
	data: any;
	rootName?: string;
	isCollapsed?: (keyPath: string[], deep: number, data: any) => boolean;
	onExpand?: (keyPath: string[], deep: number, data: any) => void;
	fallback?: React.ReactNode;
}

export const Tree = ({
	data,
	rootName = 'root',
	isCollapsed,
	onExpand,
	fallback = null,
}: TreeProps) => {
	const [raw, setRaw] = React.useState(false);

	return (
		<Box paddingY="small">
			{raw ? (
				<Raw data={data} />
			) : (
				<JsonNode
					data={data}
					name={rootName}
					deep={-1}
					isCollapsed={isCollapsed}
					onExpand={onExpand}
				/>
			)}
			<Styled.RawButtonContainer>
				<Button
					title="raw"
					type="secondary"
					background="outline"
					size="small"
					onPress={() => setRaw(!raw)}
					accessoryLeft={
						raw ? <Icon size="small" name="eyeSlash" /> : <Icon size="small" name="eye" />
					}
				/>
			</Styled.RawButtonContainer>
		</Box>
	);
};
