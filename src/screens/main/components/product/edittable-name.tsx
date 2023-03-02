import * as React from 'react';

import TextInput from '@wcpos/components/src/textinput';

const EditableName = ({ name, saveOnBlur }) => {
	const [newName, setNewName] = React.useState(name);

	return <TextInput value={newName} onChangeText={setNewName} onBlur={() => saveOnBlur(newName)} />;
};

export default EditableName;
