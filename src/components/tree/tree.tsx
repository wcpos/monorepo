import * as React from 'react';
import { Raw } from './raw';
import { JsonNode } from './json/node';
import Button from '../button';
import * as Styled from './styles';

export interface TreeProps {
	data: any;
	fallback?: React.ReactNode;
}

export const Tree = ({ data, fallback = null }: TreeProps) => {
	const [raw, setRaw] = React.useState(false);

	return (
		<Styled.Container>
			{raw ? <Raw data={data} /> : <JsonNode data={data} name="root" />}
			<Styled.RawButtonContainer>
				<Button
					title="raw"
					type="secondary"
					background="outline"
					size="small"
					onPress={() => setRaw(!raw)}
				/>
			</Styled.RawButtonContainer>
		</Styled.Container>
	);
};
