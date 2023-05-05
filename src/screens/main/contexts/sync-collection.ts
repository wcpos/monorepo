/**
 *
 */
async function syncCollection(replicationState) {
	await replicationState.audit.run({ force: true });
	replicationState.reSync();
}

export default syncCollection;
