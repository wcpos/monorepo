import React from 'react';
import Img from '../../../../../components/image';

type Props = {
	customer: any;
};

const Image = ({ customer }: Props) => {
	return <Img src={customer.avatar_url} style={{ width: 100, height: 100 }} />;
};

export default Image;
