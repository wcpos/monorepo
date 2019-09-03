import React from 'react';
import { useTranslation } from 'react-i18next';
import TextInput from '../../components/textinput';
import Button from '../../components/button';
import { ActionsView } from './styles';

interface Props {
	onSearch: any;
}

const Actions = ({ onSearch }: Props) => {
	const { t } = useTranslation();

	const handleSync = async () => {
		console.log('hi');
	};

	return (
		<ActionsView>
			<TextInput
				placeholder={t('products.search.placeholder')}
				onChangeText={onSearch}
				style={{ flex: 1 }}
			/>
			<Button title={t('products.button.sync')} onPress={handleSync} />
		</ActionsView>
	);
};

export default Actions;
