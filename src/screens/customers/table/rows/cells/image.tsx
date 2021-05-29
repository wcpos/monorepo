import * as React from 'react';
import Img from '@wcpos/common/src/components/image';

type Props = {
	customer: any;
};

const Image = ({ customer }: Props) => {
	return <Img src={customer.avatarUrl} style={{ width: 100, height: 100 }} />;
};

export default Image;
