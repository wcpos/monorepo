import * as React from 'react';

import { Input } from '@wcpos/components/src/input';

const EditableName = ({ name, saveOnBlur }) => {
	const [newName, setNewName] = React.useState(name);

	return <Input value={newName} onChangeText={setNewName} onBlur={() => saveOnBlur(newName)} />;
};

export default EditableName;
