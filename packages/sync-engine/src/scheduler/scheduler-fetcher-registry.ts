import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';
import type { FetchTask } from './replication-policy';
import type { SchedulerFetcher } from './replication-scheduler';
import type { PersistedSchedulerTaskRunnerRepository } from './rx-scheduler-task-runner';

export type SchedulerTaskSupportCandidate = Pick<
	FetchTask,
	'collection' | 'queryKey' | 'ids' | 'mode' | 'limit'
>;

export type SchedulerFetcherRegistration = {
	name: string;
	supportsTask(task: SchedulerTaskSupportCandidate): boolean;
	fetcher: SchedulerFetcher;
};

export type SchedulerFetcherRegistry = {
	supportsTask(task: SchedulerTaskSupportCandidate): boolean;
	fetcher: SchedulerFetcher;
	supportedRepository(
		repository: PersistedSchedulerTaskRunnerRepository
	): PersistedSchedulerTaskRunnerRepository;
};

function taskCandidateFromState(state: PersistedSchedulerTaskState): SchedulerTaskSupportCandidate {
	return {
		collection: state.collection,
		queryKey: state.queryKey,
		ids: state.ids,
		mode: state.mode,
		limit: state.limit,
	};
}

export function createSchedulerFetcherRegistry(
	registrations: SchedulerFetcherRegistration[]
): SchedulerFetcherRegistry {
	function matchingRegistration(
		task: SchedulerTaskSupportCandidate
	): SchedulerFetcherRegistration | null {
		return registrations.find((registration) => registration.supportsTask(task)) ?? null;
	}

	return {
		supportsTask: (task) => matchingRegistration(task) !== null,
		fetcher: async (task, context) => {
			const registration = matchingRegistration(task);
			if (!registration) {
				throw new Error(
					`No scheduler fetcher registered for ${task.collection} task ${task.queryKey}`
				);
			}
			return registration.fetcher(task, context);
		},
		supportedRepository: (repository) => ({
			readRunnable: async (nowMs) =>
				(await repository.readRunnable(nowMs)).filter(
					(state) => matchingRegistration(taskCandidateFromState(state)) !== null
				),
			claim: repository.claim.bind(repository),
			completeOrRequeue: repository.completeOrRequeue.bind(repository),
			markFailed: repository.markFailed.bind(repository),
		}),
	};
}
