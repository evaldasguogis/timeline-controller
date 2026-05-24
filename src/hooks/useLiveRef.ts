import { useEffect, useRef, MutableRefObject } from 'react';

// Tiny helper for the "ref that always mirrors a prop" pattern. Returns a
// ref whose `current` is the latest value handed to the hook — useful for
// stable callbacks (`useCallback` with `[]` deps) that need to read fresh
// props/state without being re-created each render.
//
// Sync happens in a post-commit `useEffect` rather than during render.
// In-render writes to a ref trigger React's "no refs during render" rule
// (concurrent mode may discard renders, leaving the ref out of sync with
// the rendered state). The post-commit sync is one frame behind during a
// brand-new render, but consumers always read from event handlers /
// setInterval callbacks that fire later, by which time the effect has
// run.
//
// Future-replacement note: React's `useEffectEvent` (currently
// experimental, not in the stable Grafana-shipped React) is designed to
// kill this pattern — it gives you a stable callback that always sees
// fresh closure values, no manual ref shuffle. When that lands stable,
// we can delete this helper and replace each `useLiveRef(x).current`
// read with a direct closure read inside a `useEffectEvent`. See
// https://react.dev/reference/react/experimental_useEffectEvent.
export const useLiveRef = <T>(value: T): MutableRefObject<T> => {
  const ref = useRef<T>(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
};
