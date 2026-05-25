import { renderHook } from '@testing-library/react';
import { KeyboardEvent, MouseEvent } from 'react';
import { PlaybackState } from './useReplay';
import { UsePanelKeyboardOptions, usePanelKeyboard } from './usePanelKeyboard';

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

interface RenderOptions extends Partial<UsePanelKeyboardOptions> {
  state?: PlaybackState;
}

const renderShortcuts = (overrides: RenderOptions = {}) => {
  const options: UsePanelKeyboardOptions = {
    state: 'paused',
    startPlayback: jest.fn(),
    pause: jest.fn(),
    step: jest.fn(),
    jumpToStart: jest.fn(),
    jumpToEnd: jest.fn(),
    reset: jest.fn(),
    ...overrides,
  };
  const { result } = renderHook(() => usePanelKeyboard(options));
  return { panel: result.current, handler: result.current.onKeyDown, options };
};

describe('usePanelKeyboard — shortcuts', () => {
  it.each([['k'], ['K']])('K toggles forward — starts when paused', (key) => {
    const { handler, options } = renderShortcuts({ state: 'paused' });
    handler(makeEvent({ key }));
    expect(options.startPlayback).toHaveBeenCalledWith(true);
    expect(options.pause).not.toHaveBeenCalled();
  });

  it('K toggles forward — pauses when already playing forward', () => {
    const { handler, options } = renderShortcuts({ state: 'playing-forward' });
    handler(makeEvent({ key: 'k' }));
    expect(options.pause).toHaveBeenCalledTimes(1);
    expect(options.startPlayback).not.toHaveBeenCalled();
  });

  it.each([['j'], ['J']])('J toggles backward — starts when paused', (key) => {
    const { handler, options } = renderShortcuts({ state: 'paused' });
    handler(makeEvent({ key }));
    expect(options.startPlayback).toHaveBeenCalledWith(false);
  });

  it('J toggles backward — pauses when already playing (any direction)', () => {
    const { handler, options } = renderShortcuts({ state: 'playing-back' });
    handler(makeEvent({ key: 'j' }));
    expect(options.pause).toHaveBeenCalledTimes(1);
  });

  it('steps back on comma, forward on period', () => {
    const { handler, options } = renderShortcuts();
    handler(makeEvent({ key: ',' }));
    handler(makeEvent({ key: '.' }));
    expect(options.step).toHaveBeenNthCalledWith(1, false);
    expect(options.step).toHaveBeenNthCalledWith(2, true);
  });

  it('pauses on Escape', () => {
    const { handler, options } = renderShortcuts();
    handler(makeEvent({ key: 'Escape' }));
    expect(options.pause).toHaveBeenCalledTimes(1);
  });

  it('jumps to start/end on Home/End when options are provided', () => {
    const { handler, options } = renderShortcuts();
    handler(makeEvent({ key: 'Home' }));
    handler(makeEvent({ key: 'End' }));
    expect(options.jumpToStart).toHaveBeenCalledTimes(1);
    expect(options.jumpToEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores Home/End when options are absent (basic mode)', () => {
    const event = makeEvent({ key: 'Home' });
    const { handler } = renderShortcuts({
      jumpToStart: undefined,
      jumpToEnd: undefined,
    });
    handler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each([['r'], ['R']])('resets on %s when reset is provided', (key) => {
    const { handler, options } = renderShortcuts();
    handler(makeEvent({ key }));
    expect(options.reset).toHaveBeenCalledTimes(1);
  });

  it('does not intercept keys while typing in an input', () => {
    const input = document.createElement('input');
    const { handler, options } = renderShortcuts();
    handler(makeEvent({ key: 'k', target: input }));
    handler(makeEvent({ key: ',', target: input }));
    handler(makeEvent({ key: 'Escape', target: input }));
    expect(options.startPlayback).not.toHaveBeenCalled();
    expect(options.step).not.toHaveBeenCalled();
    expect(options.pause).not.toHaveBeenCalled();
  });

  it('ignores keys held with Ctrl/Meta/Alt modifiers', () => {
    const { handler, options } = renderShortcuts();
    handler(makeEvent({ key: 'k', ctrlKey: true }));
    handler(makeEvent({ key: 'k', metaKey: true }));
    handler(makeEvent({ key: 'k', altKey: true }));
    expect(options.startPlayback).not.toHaveBeenCalled();
  });

  it('calls preventDefault when handling a key', () => {
    const event = makeEvent({ key: 'k' });
    const { handler } = renderShortcuts();
    handler(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

describe('usePanelKeyboard — focus management', () => {
  it('exposes ref + tabIndex=-1 so the wrapper is focusable by click but not Tab', () => {
    const { panel } = renderShortcuts();
    expect(panel.tabIndex).toBe(-1);
    expect(panel.ref).toBeDefined();
  });

  it('redirects focus to the wrapper when a non-focusable area is clicked', () => {
    const { panel } = renderShortcuts();
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
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
