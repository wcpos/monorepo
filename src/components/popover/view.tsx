import * as React from 'react';
import Portal from '../portal';
import Arrow from '../arrow';
import { ContentView, Wrapper } from './styles';

export type Props = {
	children: React.ReactChild;
};

const PopoverView: React.FunctionComponent<Props> = ({ children, measurements }) => {
	return (
		<Portal>
			<Wrapper style={{ top: measurements.y, left: measurements.x }}>
				<Arrow />
				<ContentView>{children}</ContentView>
			</Wrapper>
		</Portal>
	);
};

export default PopoverView;
