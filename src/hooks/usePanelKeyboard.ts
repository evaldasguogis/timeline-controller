import { useCallback, useRef, KeyboardEvent, MouseEvent, RefObject } from 'react';
import { PlaybackState } from './useReplay';

// Panel-wide keyboard shortcuts + click-to-focus, packaged as a set of
// props to spread onto each mode's outer wrapper.
//
// Takes the transport primitives (state, startPlayback, pause, step) and
// derives the togglers internally — both playback hooks (Windowed +
// GlobalRange) would otherwise re-derive togglePlay / togglePlayBackward
// identically. Optional `jumpToStart` / `jumpToEnd` / `reset` bindings
// cover the per-mode "extra" action (window modes have jump; basic mode
// has reset).
//
// Keys: K toggles forward play/pause, J toggles backward, `,` / `.`
// step, Home / End jump (when bound), Esc pauses, R resets (when bound).
// Skipped while focus is in a text input or when Ctrl/Meta/Alt is held.

export interface UsePanelKeyboardBindings {
  // Current playback state. Drives togglers' branch (paused → start, else
  // → pause).
  state: PlaybackState;
  startPlayback: (forward: boolean) => void;
  pause: () => void;
  step: (forward: boolean) => void;
  // Optional — sliding/event modes provide jump; basic mode provides
  // reset. Each only fires when its key is pressed AND the binding is set.
  jumpToStart?: () => void;
  jumpToEnd?: () => void;
  reset?: () => void;
}

// Props the hook hands back are designed to be spread onto a mode's outer
// wrapper div. `ref` and `tabIndex={-1}` make the wrapper programmatically
// focusable without adding it to the Tab cycle; `onMouseDown` parks focus
// on the wrapper when the user clicks a non-focusable area (gap between
// buttons, the readout text) so the keyboard shortcuts arm with one click.
export interface PanelKeyboardProps {
  ref: RefObject<HTMLDivElement>;
  tabIndex: -1;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
}

// Anything matching this selector takes focus on its own when clicked, so
// we leave it to the browser. `[tabindex="-1"]` is excluded — those need
// the same redirect treatment as plain divs.
const FOCUSABLE_SELECTOR =
  'button, input, select, textarea, a[href], [role="slider"], [tabindex]:not([tabindex="-1"])';

// True when the keyboard event came from a text-entry control. The step
// dropdown's filter input is the main case — typing 'k' or '.' there must
// not pause playback.
const isTextEntry = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

export const usePanelKeyboard = ({
  state,
  startPlayback,
  pause,
  step,
  jumpToStart,
  jumpToEnd,
  reset,
}: UsePanelKeyboardBindings): PanelKeyboardProps => {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      // Don't interfere with typing in the step dropdown, or with modifier
      // combinations the user may have bound to OS / browser shortcuts.
      if (isTextEntry(event.target)) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      switch (event.key) {
        case 'k':
        case 'K':
          event.preventDefault();
          if (state === 'paused') {
            startPlayback(true);
          } else {
            pause();
          }
          return;
        case 'j':
        case 'J':
          event.preventDefault();
          if (state === 'paused') {
            startPlayback(false);
          } else {
            pause();
          }
          return;
        case ',':
          event.preventDefault();
          step(false);
          return;
        case '.':
          event.preventDefault();
          step(true);
          return;
        case 'Escape':
          event.preventDefault();
          pause();
          return;
        case 'Home':
          if (jumpToStart) {
            event.preventDefault();
            jumpToStart();
          }
          return;
        case 'End':
          if (jumpToEnd) {
            event.preventDefault();
            jumpToEnd();
          }
          return;
        case 'r':
        case 'R':
          if (reset) {
            event.preventDefault();
            reset();
          }
          return;
      }
    },
    [state, startPlayback, pause, step, jumpToStart, jumpToEnd, reset]
  );

  const onMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    // Native focusable elements take focus on their own; only redirect when
    // the click landed on something that wouldn't otherwise receive focus.
    if (target && target.closest(FOCUSABLE_SELECTOR)) {
      return;
    }
    // preventScroll keeps long dashboards from jumping to the panel when
    // the wrapper takes focus.
    ref.current?.focus({ preventScroll: true });
  }, []);

  return { ref, tabIndex: -1, onKeyDown, onMouseDown };
};
