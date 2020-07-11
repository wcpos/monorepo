//raw.githubusercontent.com/szybogi/thesis/master/src/app/service/database.service.ts
https: import { transition } from '@angular/animations';
import { Injectable } from '@angular/core';
import RxDB, { RxDatabase, RxDocument } from 'rxdb';
import * as idb from 'pouchdb-adapter-idb';
import { from, Observable, zip, Subject, BehaviorSubject, of, combineLatest } from 'rxjs';
import {
	tap,
	share,
	switchMap,
	delayWhen,
	map,
	withLatestFrom,
	flatMap,
	startWith,
	take,
	shareReplay,
	filter,
	mergeMap,
	toArray,
} from 'rxjs/operators';
import * as moment from 'moment';
import { Router, NavigationStart, Event as NavigationEvent } from '@angular/router';
import { transactionSchema, Transaction } from '../model/transaction.class';
import { userSchema, User } from '../model/user.interface';
import { lockupSchema, Lockup } from '../model/lockup.interface';
import {
	Database,
	WalletCollection,
	DatabaseCollection,
	TransactionCollection,
	UserCollection,
	LockupCollection,
} from './database';
import { Wallet, walletSchema } from '../model/wallet.interface';

@Injectable({
	providedIn: 'root',
})
export class DatabaseService {
	private wId;

	public database$: Observable<RxDatabase<DatabaseCollection>> = of(RxDB.plugin(idb)).pipe(
		switchMap(() => RxDB.create<DatabaseCollection>({ name: 'db', adapter: 'idb' })),
		delayWhen((db) =>
			from(
				db.collection<WalletCollection>({ name: 'wallet', schema: walletSchema })
			)
		),
		delayWhen((db) =>
			from(
				db.collection<TransactionCollection>({ name: 'transaction', schema: transactionSchema })
			)
		),
		delayWhen((db) =>
			from(
				db.collection<UserCollection>({ name: 'user', schema: userSchema })
			)
		),
		delayWhen((db) =>
			from(
				db.collection<LockupCollection>({ name: 'lockup', schema: lockupSchema })
			)
		),
		delayWhen((db) => this.init(db)),
		shareReplay(1)
	);

	public userUpdate = new Subject<User>();
	public lockupSaver = new Subject<Lockup>();
	public walletSaver = new Subject<Wallet>();
	public walletDeleter = new Subject<Wallet>();
	public transactionSaver = new Subject<Transaction>();
	public transactionDeleter = new Subject<Transaction>();
	public walletsReplayed$ = this.database$.pipe(
		switchMap((db) => db.wallet.find().$),
		shareReplay(1)
	);

	public transactionsReplayed$ = this.database$.pipe(
		switchMap((db) => db.transaction.find().$),
		shareReplay(1)
	);

	public incomesReplayed$ = this.database$.pipe(
		switchMap((db) => db.transaction.find().$),
		map((transactions) => transactions.filter((t) => t.type === 'Bevétel' && !t.transfer)),
		shareReplay(1)
	);

	public spendingsReplayed$ = this.database$.pipe(
		switchMap((db) => db.transaction.find().$),
		map((transactions) => transactions.filter((t) => t.type === 'Kiadás' && !t.transfer)),
		shareReplay(1)
	);

	public lockupsReplayed$ = this.database$.pipe(
		switchMap((db) => db.lockup.find().$),
		shareReplay(1)
	);

	public transactions$ = this.database$.pipe(
		switchMap((db) => db.transaction.find().$),
		share()
	);

	public lockupsUpdates$ = this.database$.pipe(
		switchMap((db) => db.lockup.update$),
		share()
	);

	public transactionsUpdates$ = this.database$.pipe(
		switchMap((db) => db.transaction.update$),
		share()
	);

	public wallets$ = this.database$.pipe(switchMap((db) => db.wallet.find().$)).subscribe((w) => {
		w.forEach((w) => {
			if (this.wId === undefined) {
				this.wId = 2;
			}
			if (Number(w.id) > this.wId) {
				this.wId = Number(w.id) + 1;
				console.log(this.wId);
			}
		});
	});

	public user$ = this.database$.pipe(
		switchMap((db) => db.user.findOne({ id: '1' }).$),
		shareReplay(1)
	);

	public transactionNextId$ = this.transactionsReplayed$.pipe(
		map(
			(transactions) =>
				`${
					transactions
						.map((transaction) => Number(transaction.id))
						.reduce((acc, next) => (acc < next ? next : acc), 0) + 1
				}`
		),
		startWith('1')
	);

	public lockupNextId$ = this.lockupsReplayed$.pipe(
		map(
			(lockups) =>
				`${
					lockups
						.map((lockup) => Number(lockup.id))
						.reduce((acc, next) => (acc < next ? next : acc), 0) + 1
				}`
		),
		startWith('1')
	);

	public constructor(private router: Router) {
		this.userUpdate
			.pipe(
				withLatestFrom(this.database$),
				switchMap(([user, db]) => db.user.upsert(user))
			)
			.subscribe((next) => {
				console.log('User saved!!');
				console.log(next);
			});

		this.walletSaver
			.pipe(
				tap((wallet) => {
					if (!wallet.id) {
						wallet.id = String(this.wId);
						this.wId++;
					}
				}),
				withLatestFrom(this.database$),
				switchMap(([wallet, db]) => db.wallet.upsert(wallet))
			)
			.subscribe((next) => {
				console.log('New wallet saved!!');
				console.log(next);
			});

		this.walletDeleter
			.pipe(
				withLatestFrom(this.database$),
				switchMap(([wallet, db]) => db.wallet.find({ name: wallet.name }).$.pipe(take(1))),
				flatMap((walletDocs) => walletDocs),
				tap((d) => console.log(`Wallet deleter, removes: ${d}`)),
				switchMap((walletDoc) => walletDoc.remove())
			)
			.subscribe((next) => {
				console.log(`Wallet deleted? ${next}`);
			});

		this.transactionSaver
			.pipe(
				withLatestFrom(this.transactionNextId$),
				tap(([transaction, id]) => !transaction.id && (transaction.id = id)),
				map(([transaction]) => transaction),
				withLatestFrom(this.database$),
				switchMap(([transaction, db]) => db.transaction.upsert(transaction))
			)
			.subscribe((next) => {
				console.log('New transaction saved!!');
				console.log(next);
			});

		this.transactionDeleter
			.pipe(
				withLatestFrom(this.database$),
				switchMap(([transaction, db]) =>
					db.transaction.find({ id: transaction.id }).$.pipe(take(1))
				),
				flatMap((transactions) => transactions),
				tap((d) => console.log(`Transaction deleter, removes: ${d}`)),
				switchMap((transaction) => transaction.remove())
			)
			.subscribe((next) => {
				console.log(`Transaction deleted? ${next}`);
			});

		this.lockupSaver
			.pipe(
				withLatestFrom(this.lockupNextId$),
				tap(([lockup, id]) => !lockup.id && (lockup.id = id)),
				map(([lockup]) => lockup),
				withLatestFrom(this.database$),
				switchMap(([lockup, db]) => db.lockup.upsert(lockup))
			)
			.subscribe((next) => {
				console.log('New transaction saved!!');
				console.log(next);
			});

		combineLatest([
			this.router.events.pipe(filter((event: NavigationEvent) => event instanceof NavigationStart)),
			this.lockupsReplayed$,
		])
			.pipe(
				map(([routerEvent, lockups]) =>
					lockups.filter((l) => {
						const now = moment();
						const end = moment.unix(l.end);
						const diff = now.diff(end, 'days', true);
						return l.status === 'Aktív' && diff >= 0;
					})
				),
				flatMap((lockups) => lockups),
				mergeMap((l) =>
					from(
						l.atomicUpdate((lock) => {
							lock.status = 'Teljesítve';
							return lock;
						})
					).pipe(
						withLatestFrom(this.transactionNextId$),
						mergeMap(([lock, nextTransactionId]) =>
							((lock.collection.database as any) as RxDatabase<
								DatabaseCollection
							>).transaction.upsert({
								id: nextTransactionId,
								name: 'Lekötés teljesítve',
								type: 'Bevétel',
								walletRef: lock.walletRef,
								date: lock.end,
								amount: lock.amount,
								category: 'Hosszútávú befektetés',
								subcategory: lock.name,
								transfer: false,
								target: '',
							})
						)
					)
				)
			)
			.subscribe();
	}

	private init(db: RxDatabase<DatabaseCollection>) {
		const initWalletUpsert = db.wallet.upsert({
			id: '1',
			name: 'Készpénz',
			individual: 'unique',
			otherOwner: '',
		});

		return zip(initWalletUpsert);
	}
}
