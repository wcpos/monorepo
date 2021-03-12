import * as React from 'react';
import Icon from '../../../../../components/icon';

type Props = {
	status: string;
};

const Status = ({ status }: Props) => {
	// @ts-ignore
	return <Icon name={status} />;
};

export default Status;
