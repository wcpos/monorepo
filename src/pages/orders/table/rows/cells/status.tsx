import React from 'react';
import Icon from '../../../../../components/icon';

type Props = {
	status: string;
};

const Status = ({ status }: Props) => {
	return <Icon name={status} />;
};

export default Status;
