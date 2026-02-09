import isEmpty from 'lodash/isEmpty';
import { RxPlugin } from 'rxdb';
import { of } from 'rxjs';

export const findOneFixPlugin: RxPlugin = {
	name: 'find-one-fix',
	rxdb: true,
	prototypes: {
		RxCollection: (proto: any) => {
			proto.findOneFix = function (this: any, queryObj: any) {
				if (isEmpty(queryObj)) {
					return {
						exec: () => Promise.resolve(null),
						$: of(null),
					};
				}
				return proto.findOne.call(this, queryObj);
			};
		},
	},
	overwritable: {},
	hooks: {},
};
