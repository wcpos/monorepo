import React, { Fragment } from 'react';

interface Props {
	firstName?: string;
	lastName?: string;
}

const Name = ({ firstName, lastName }: Props) => {
	return (
		<Fragment>
			{firstName} {lastName}
		</Fragment>
	);
};

export default Name;
