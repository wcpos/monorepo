import React from 'react';
import Button from '../../../components/button';

const CustomerSelect = ({ ui }) => {
	return <Button title="Restore Default Settings" onPress={ui.reset} />;
};

export default CustomerSelect;
