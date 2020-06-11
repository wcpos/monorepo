import React from 'react';
import Header from '../header';
import * as Styled from './styles';
import useMeasure from '../../hooks/use-measure';

interface Props {
	header?: string | React.ReactNode;
	children?: React.ReactNode;
}

const Page: React.FC<Props> = ({ children, ...props }) => {
	const headerComponent =
		typeof props.header === 'string' ? <Header>{props.header}</Header> : props.header;

	const [measurements, onMeasure] = React.useState({
		height: 0,
		pageX: 0,
		pageY: 0,
		width: 0,
		x: 0,
		y: 0,
	});
	const ref = React.useRef(null);
	const { onLayout } = useMeasure({ onMeasure, ref });

	console.log(measurements);

	return (
		// <PageView onLayout={onLayout} ref={ref}>
		<Styled.Page>
			{headerComponent && <Styled.Header>{headerComponent}</Styled.Header>}
			<Styled.Main>{children}</Styled.Main>
		</Styled.Page>
	);
};

export default Page;
