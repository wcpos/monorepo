import React from 'react';
import Arrow from './svg/arrow.svg';
import Tick from './svg/tick.svg';

interface Props {}

const Icon: React.FC<Props> = () => {
	return (
		<>
			<Arrow width={120} height={40} fill="#000" />
			<Tick width={120} height={40} fill="#000" />
		</>
	);
};

export default Icon;
