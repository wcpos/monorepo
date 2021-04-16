import * as React from 'react';
import { Text, View, FlatList, SafeAreaView } from 'react-native';
import { ThemeProvider } from './hooks/use-theme';
import { AppStateProvider } from './hooks/use-app-state';
import TranslationService from './services/translation';
import Navigator from './navigators';
import Portal from './components/portal';
import ErrorBoundary from './components/error';

const i18n = new TranslationService();

const App: React.FC = () => {
	const data = [
		{ id: 1, title: 'Item 1' },
		{ id: 2, title: 'Item 2' },
		{ id: 3, title: 'Item 3' },
		{ id: 4, title: 'Item 4' },
		{ id: 5, title: 'Item 5' },
		{ id: 6, title: 'Item 6' },
		{ id: 7, title: 'Item 7' },
		{ id: 8, title: 'Item 8' },
		{ id: 9, title: 'Item 9' },
		{ id: 10, title: 'Item 10' },
		{ id: 11, title: 'Item 11' },
		{ id: 12, title: 'Item 12' },
		{ id: 13, title: 'Item 13' },
		{ id: 14, title: 'Item 14' },
		{ id: 15, title: 'Item 15' },
		{ id: 16, title: 'Item 16' },
		{ id: 17, title: 'Item 17' },
		{ id: 18, title: 'Item 18' },
		{ id: 19, title: 'Item 19' },
	];

	const renderItem = ({ item }) => {
		return (
			<View style={{ padding: 20, backgroundColor: 'pink', marginBottom: 20 }}>
				<Text>{item.title}</Text>
			</View>
		);
	};

	// <React.StrictMode>
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>loading app...</Text>}>
				<AppStateProvider i18n={i18n}>
					<ThemeProvider>
						<Portal.Provider>
							{/* <Navigator /> */}
							<SafeAreaView
								style={{
									backgroundColor: 'red',
									flexDirection: 'column',
									flexBasis: '100%',
									// position: 'relative',
								}}
							>
								<View style={{ backgroundColor: 'blue', padding: 20 }}>
									<Text>Header</Text>
								</View>
								<View
									style={{
										backgroundColor: 'green',

										position: 'absolute',
										top: 100,
										bottom: 0,
										left: 0,
										right: 0,
										padding: 5,
									}}
								>
									<View style={{ height: '100%', flexDirection: 'row' }}>
										<View style={{ height: '100%', flex: 1, width: '50%', padding: 5 }}>
											<View style={{ height: '100%', width: '100%', flexDirection: 'column' }}>
												<View style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }}>
													<Text>Header</Text>
												</View>
												<View style={{ flexGrow: 0, flexShrink: 1, flexBasis: 'auto' }}>
													<FlatList
														data={data}
														renderItem={renderItem}
														keyExtractor={(item) => item.id}
													/>
												</View>
												<View style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }}>
													<Text>Footer</Text>
												</View>
											</View>
										</View>
										<View style={{ width: '50%', padding: 5 }}>
											<Text>Right</Text>
										</View>
									</View>
								</View>
							</SafeAreaView>
							<Portal.Manager />
						</Portal.Provider>
					</ThemeProvider>
				</AppStateProvider>
			</React.Suspense>
		</ErrorBoundary>
	);
	// </React.StrictMode>
};

export default App;
