import { renderHook } from '@testing-library/react';
import { KeyboardEvent, MouseEvent } from 'react';
import { PlaybackShortcutBindings, usePlaybackShortcuts } from './usePlaybackShortcuts';

const makeEvent = (overrides: Partial<KeyboardEvent<HTMLElement>>): KeyboardEvent<HTMLElement> =>
  ({
    key: '',
    code: '',
    target: document.createElement('div'),
    preventDefault: jest.fn(),
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  } as unknown as KeyboardEvent<HTMLElement>);

const makeMouseEvent = (
  target: HTMLElement
): MouseEvent<HTMLDivElement> => ({ target } as unknown as MouseEvent<HTMLDivElement>);

const renderShortcuts = (overrides: Partial<PlaybackShortcutBindings> = {}) => {
  const bindings: PlaybackShortcutBindings = {
    togglePlay: jest.fn(),
    togglePlayBackward: jest.fn(),
    pause: jest.fn(),
    stepBack: jest.fn(),
    stepForward: jest.fn(),
    jumpToStart: jest.fn(),
    jumpToEnd: jest.fn(),
    reset: jest.fn(),
    ...overrides,
  };
  const { result } = renderHook(() => usePlaybackShortcuts(bindings));
  return { panel: result.current, handler: result.current.onKeyDown, bindings };
};

describe('usePlaybackShortcuts', () => {
  it.each([
    ['k'],
    ['K'],
  ])('toggles play forward on %s', (key) => {
    const { handler, bindings } = renderShortcuts();
    handler(makeEvent({ key }));
    expect(bindings.togglePlay).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['j'],
    ['J'],
  ])('toggles play backward on %s', (key) => {
    const { handler, bindings } = renderShortcuts();
    handler(makeEvent({ key }));
    expect(bindings.togglePlayBackward).toHaveBeenCalledTimes(1);
  });

  it('steps back on comma, forward on period', () => {
    const { handler, bindings } = renderShortcuts();
    handler(makeEvent({ key: ',' }));
    handler(makeEvent({ key: '.' }));
    expect(bindings.stepBack).toHaveBeenCalledTimes(1);
    expect(bindings.stepForward).toHaveBeenCalledTimes(1);
  });

  it('pauses on Escape', () => {
    const { handler, bindings } = renderShortcuts();
    handler(makeEvent({ key: 'Escape' }));
    expect(bindings.pause).toHaveBeenCalledTimes(1);
  });

  it('jumps to start/end on Home/End when bindings are provided', () => {
    const { handler, bindings } = renderShortcuts();
    handler(makeEvent({ key: 'Home' }));
    handler(makeEvent({ key: 'End' }));
    expect(bindings.jumpToStart).toHaveBeenCalledTimes(1);
    expect(bindings.jumpToEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores Home/End when bindings are absent (basic mode)', () => {
    const togglePlay = jest.fn();
    const event = makeEvent({ key: 'Home' });
    const { handler } = renderShortcuts({
      togglePlay,
      jumpToStart: undefined,
      jumpToEnd: undefined,
    });
    handler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each([['r'], ['R']])('resets on %s when reset is provided', (key) => {
    const { handler, bindings } = renderShortcuts();
    handler(makeEvent({ key }));
    expect(bindings.reset).toHaveBeenCalledTimes(1);
  });

  it('does not intercept keys while typing in an input', () => {
    const input = document.createElement('input');
    const { handler, bindings } = renderShortcuts();
    handler(makeEvent({ key: 'k', target: input }));
    handler(makeEvent({ key: ',', target: input }));
    handler(makeEvent({ key: 'Escape', target: input }));
    expect(bindings.togglePlay).not.toHaveBeenCalled();
    expect(bindings.stepBack).not.toHaveBeenCalled();
    expect(bindings.pause).not.toHaveBeenCalled();
  });

  it('ignores keys held with Ctrl/Meta/Alt modifiers', () => {
    const { handler, bindings } = renderShortcuts();
    handler(makeEvent({ key: 'k', ctrlKey: true }));
    handler(makeEvent({ key: 'k', metaKey: true }));
    handler(makeEvent({ key: 'k', altKey: true }));
    expect(bindings.togglePlay).not.toHaveBeenCalled();
  });

  it('calls preventDefault when handling a key', () => {
    const event = makeEvent({ key: 'k' });
    const { handler } = renderShortcuts();
    handler(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

describe('usePlaybackShortcuts — focus management', () => {
  it('exposes ref + tabIndex=-1 so the wrapper is focusable by click but not Tab', () => {
    const { panel } = renderShortcuts();
    expect(panel.tabIndex).toBe(-1);
    expect(panel.ref).toBeDefined();
  });

  it('redirects focus to the wrapper when a non-focusable area is clicked', () => {
    const { panel } = renderShortcuts();
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    // Simulate React mounting — assigning the ref the way it would in real DOM.
    (panel.ref as { current: HTMLDivElement | null }).current = wrapper;
    const focusSpy = jest.spyOn(wrapper, 'focus');
    const nonFocusableChild = document.createElement('span');
    wrapper.appendChild(nonFocusableChild);

    panel.onMouseDown(makeMouseEvent(nonFocusableChild));
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    document.body.removeChild(wrapper);
  });

  it('leaves focus alone when the click landed on a focusable element', () => {
    const { panel } = renderShortcuts();
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    (panel.ref as { current: HTMLDivElement | null }).current = wrapper;
    const focusSpy = jest.spyOn(wrapper, 'focus');
    const button = document.createElement('button');
    wrapper.appendChild(button);

    panel.onMouseDown(makeMouseEvent(button));
    expect(focusSpy).not.toHaveBeenCalled();
    document.body.removeChild(wrapper);
  });

  it('leaves focus alone when the click landed on the slider track', () => {
    const { panel } = renderShortcuts();
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    (panel.ref as { current: HTMLDivElement | null }).current = wrapper;
    const focusSpy = jest.spyOn(wrapper, 'focus');
    const slider = document.createElement('div');
    slider.setAttribute('role', 'slider');
    slider.tabIndex = 0;
    wrapper.appendChild(slider);

    panel.onMouseDown(makeMouseEvent(slider));
    expect(focusSpy).not.toHaveBeenCalled();
    document.body.removeChild(wrapper);
  });
});
