import * as React from 'react';
import { Raw } from './raw';
import { JsonNode } from './json/node';
import Button from '../button';
import Icon from '../icon';
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
		<Styled.Container>
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
						raw ? (
							<Icon size="small" name="visibility-off" />
						) : (
							<Icon size="small" name="visibility" />
						)
					}
				/>
			</Styled.RawButtonContainer>
		</Styled.Container>
	);
};
