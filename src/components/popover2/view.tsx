import * as React from 'react';
import Arrow from '../arrow';
import { ContentView, Wrapper } from './styles';

export type Props = {
	children: React.ReactChild;
};

const PopoverView: React.FunctionComponent<Props> = ({ children }) => {
	return (
		<Wrapper>
			<Arrow />
			<ContentView>{children}</ContentView>
		</Wrapper>
	);
};

export default PopoverView;
