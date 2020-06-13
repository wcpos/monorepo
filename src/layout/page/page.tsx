import React from 'react';
import Header from '../header';
import * as Styled from './styles';
import useMeasure from '../../hooks/use-measure';

interface Props {
	header?: string | React.ReactNode;
	children?: React.ReactNode;
}

const Page: React.FC<Props> = ({ children, header }) => {
	const headerComponent = typeof header === 'string' ? <Header>{header}</Header> : header;

	// const [measurements, onMeasure] = React.useState({
	// 	height: 0,
	// 	pageX: 0,
	// 	pageY: 0,
	// 	width: 0,
	// 	x: 0,
	// 	y: 0,
	// });
	// const [measurements, onMeasure] = React.useState();
	const onMeasure = (measurements) => {
		console.log(measurements);
	};
	const ref = React.useRef(null);
	const { onLayout } = useMeasure({ onMeasure, ref });

	// console.log(measurements);

	return (
		<Styled.Page onLayout={onLayout} ref={ref}>
			{/* <Styled.Page> */}
			{headerComponent && <Styled.Header>{headerComponent}</Styled.Header>}
			<Styled.Main>{children}</Styled.Main>
		</Styled.Page>
	);
};

export default Page;
