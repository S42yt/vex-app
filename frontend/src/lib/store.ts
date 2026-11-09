import { useSyncExternalStore } from "react";

export abstract class Store<T> {
	protected abstract snapshot: T;
	private subscribers = new Set<() => void>();

	subscribe = (onChange: () => void): (() => void) => {
		this.subscribers.add(onChange);
		return () => this.subscribers.delete(onChange);
	};

	getSnapshot = (): T => this.snapshot;

	protected publish(snapshot: T): void {
		this.snapshot = snapshot;
		this.subscribers.forEach((notify) => notify());
	}

	protected update(patch: Partial<T>): void {
		this.publish({ ...this.snapshot, ...patch });
	}
}

export function useStore<T>(store: Store<T>): T {
	return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
