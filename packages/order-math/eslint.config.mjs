import { config } from '../eslint/index.js';

export default [
	...config,
	{
		rules: {
			'no-restricted-imports': ['error', {
				paths: [
					{ name: 'react', message: 'order-math is pure — no React.' },
					{ name: 'rxdb', message: 'order-math is pure — no RxDB.' },
					{ name: 'rxjs', message: 'order-math is pure — no observables.' },
					{ name: 'observable-hooks', message: 'order-math is pure — no observables.' },
					{ name: '@wcpos/utils/logger', message: 'Faults are EngineWarning data, not logs.' },
					{ name: '@wcpos/query', message: 'order-math is pure — no data layer.' },
					{ name: '@wcpos/hooks', message: 'order-math is pure — no hooks.' },
				],
				patterns: ['react-*', 'rxdb/*', 'rxjs/*'],
			}],
		},
	},
];
