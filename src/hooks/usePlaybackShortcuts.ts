import { useCallback, useRef, KeyboardEvent, MouseEvent, RefObject } from 'react';

// Panel-wide keyboard shortcuts. Wired up by each mode onto its outer
// wrapper's onKeyDown so any focused control (track, transport button,
// step dropdown — but not while typing) can trigger transport actions.
//
// Keys mirror media-player conventions (K, Space, ,/., Home/End, Esc).
// Each mode passes the actions it supports — basic mode skips Home/End,
// sliding/event skip the reset binding, etc.

export interface PlaybackShortcutBindings {
  // Toggle forward play/pause. If the panel is currently playing in *any*
  // direction this should pause; if paused it should start playing forward.
  // Matches video-player K semantics.
  togglePlay: () => void;
  // Toggle backward play/pause, mirroring togglePlay but in reverse.
  togglePlayBackward: () => void;
  pause: () => void;
  stepBack: () => void;
  stepForward: () => void;
  // Optional — sliding/event modes provide jump; basic mode provides reset.
  jumpToStart?: () => void;
  jumpToEnd?: () => void;
  reset?: () => void;
}

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

export const usePlaybackShortcuts = ({
  togglePlay,
  togglePlayBackward,
  pause,
  stepBack,
  stepForward,
  jumpToStart,
  jumpToEnd,
  reset,
}: PlaybackShortcutBindings): PanelKeyboardProps => {
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
          togglePlay();
          return;
        case 'j':
        case 'J':
          event.preventDefault();
          togglePlayBackward();
          return;
        case ',':
          event.preventDefault();
          stepBack();
          return;
        case '.':
          event.preventDefault();
          stepForward();
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
    [togglePlay, togglePlayBackward, pause, stepBack, stepForward, jumpToStart, jumpToEnd, reset]
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
