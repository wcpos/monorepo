import React from 'react';
import { useTranslation } from 'react-i18next';
import TextInput from '../../components/textinput';
import Button from '../../components/button';
import { syncProducts } from '../../actions/product';
import { ActionsView } from './styles';
import Api from '../../services/api';

interface Props {
	onSearch: any;
}

const Actions = ({ onSearch }: Props) => {
	const { t, i18n } = useTranslation();

	const handleSync = async () => {
		const api = new Api({});
		return api.sync('products');
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
