"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DependencyList } from "react";

export type QueryState<T> =
  | { status: "loading"; data: undefined; error: undefined }
  | { status: "success"; data: T; error: undefined }
  | { status: "error"; data: undefined; error: unknown };

const LOADING = { status: "loading", data: undefined, error: undefined } as const;

const sameDeps = (a: DependencyList, b: DependencyList) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/**
 * Minimal async-data hook for client screens (no react-query on purpose — each screen
 * needs a handful of reads).
 *
 * @example
 *   const groups = useQuery(() => repo.listMyGroups(), []);
 *   if (groups.status === "loading") return <SkeletonList />;
 *
 * Changing `deps` shows "loading" again (no stale data from the previous resource).
 * `reload()` refetches but keeps the current data visible until the new value arrives.
 */
export function useQuery<T>(fn: () => Promise<T>, deps: DependencyList) {
  // Result is tagged with the deps it was fetched for; a mismatch reads as loading.
  const [state, setState] = useState<{ deps: DependencyList | null; result: QueryState<T> }>({
    deps: null,
    result: LOADING,
  });
  const fnRef = useRef(fn);
  const depsRef = useRef(deps);
  useLayoutEffect(() => {
    fnRef.current = fn;
    depsRef.current = deps;
  });
  const run = useRef(0);

  const fetchFor = useCallback((forDeps: DependencyList) => {
    const id = ++run.current;
    fnRef.current().then(
      (data) => {
        if (id === run.current) setState({ deps: forDeps, result: { status: "success", data, error: undefined } });
      },
      (error: unknown) => {
        if (id === run.current) setState({ deps: forDeps, result: { status: "error", data: undefined, error } });
      },
    );
  }, []);

  useEffect(() => {
    fetchFor(deps);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps like useEffect
  }, deps);

  const reload = useCallback(() => fetchFor(depsRef.current), [fetchFor]);
  const result: QueryState<T> = state.deps && sameDeps(state.deps, deps) ? state.result : LOADING;
  return { ...result, reload };
}

/**
 * Wraps a mutation with pending/error state.
 *
 * @example
 *   const remove = useMutation((id: string) => repo.removeMember(groupId, id));
 *   await remove.run(member.id);
 */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async (...args: A): Promise<R> => {
    setPending(true);
    setError(undefined);
    try {
      return await fnRef.current(...args);
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error };
}
