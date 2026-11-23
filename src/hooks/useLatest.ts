import { useLayoutEffect, useRef } from 'react';

/** A ref that holds the value from the latest render, updated before any effect runs. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
