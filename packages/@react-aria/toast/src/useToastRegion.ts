import {AriaLabelingProps, DOMAttributes} from '@react-types/shared';
import {focusWithoutScrolling, mergeProps, useLayoutEffect} from '@react-aria/utils';
import {getInteractionModality, useFocusWithin, useHover} from '@react-aria/interactions';
// @ts-ignore
import intlMessages from '../intl/*.json';
import {RefObject, useEffect, useRef} from 'react';
import {ToastState} from '@react-stately/toast';
import {useLandmark} from '@react-aria/landmark';
import {useLocalizedStringFormatter} from '@react-aria/i18n';

export interface AriaToastRegionProps extends AriaLabelingProps {
  /**
   * An accessibility label for the toast region.
   * @default "Notifications"
   */
  'aria-label'?: string
}

export interface ToastRegionAria {
  /** Props for the landmark region element. */
  regionProps: DOMAttributes
}

/**
 * Provides the behavior and accessibility implementation for a toast region containing one or more toasts.
 * Toasts display brief, temporary notifications of actions, errors, or other events in an application.
 */
export function useToastRegion<T>(props: AriaToastRegionProps, state: ToastState<T>, ref: RefObject<HTMLElement>): ToastRegionAria {
  let stringFormatter = useLocalizedStringFormatter(intlMessages, '@react-aria/toast');
  let {landmarkProps} = useLandmark({
    role: 'region',
    'aria-label': props['aria-label'] || stringFormatter.format('notifications', {count: state.visibleToasts.length})
  }, ref);

  let {hoverProps} = useHover({
    onHoverStart: state.pauseAll,
    onHoverEnd: state.resumeAll
  });

  // Manage focus within the toast region.
  // If a focused containing toast is removed, move focus to the next toast, or the previous toast if there is no next toast.
  // We might be making an assumption with how this works if someone implements the priority queue differently, or
  // if they only show one toast at a time.
  let toasts = useRef([]);
  let prevVisibleToasts = useRef(state.visibleToasts);
  let focusedToast = useRef(null);
  useLayoutEffect(() => {
    // If no toast has focus, then don't do anything.
    if (focusedToast.current === -1 || state.visibleToasts.length === 0) {
      toasts.current = [];
      prevVisibleToasts.current = state.visibleToasts;
      return;
    }
    toasts.current = [...ref.current.querySelectorAll('[role="alertdialog"]')];
    // If the visible toasts haven't changed, we don't need to do anything.
    if (prevVisibleToasts.current.length === state.visibleToasts.length
      && state.visibleToasts.every((t, i) => t.key === prevVisibleToasts.current[i].key)) {
      prevVisibleToasts.current = state.visibleToasts;
      return;
    }
    // Get a list of all removed toasts by index.
    let removedToasts = prevVisibleToasts.current
      .map((t, i) => ({
        ...t,
        i,
        isRemoved: !state.visibleToasts.some(t2 => t.key === t2.key)
      }));
    // should be able to do removedToasts.length - findIndex to get the same value
    let removedToast = removedToasts.findIndex(t => t.i === focusedToast.current);

    // If the focused toast was removed, focus the next or previous toast.
    if (removedToast > -1) {
      let i = 0;
      let nextToast;
      let prevToast;
      while (i <= removedToast) {
        if (!removedToasts[i].isRemoved) {
          prevToast = Math.max(0, i - 1);
        }
        i++;
      }
      while (i < removedToasts.length) {
        if (!removedToasts[i].isRemoved) {
          nextToast = i - 1;
          break;
        }
        i++;
      }

      if (prevToast >= 0 && prevToast < toasts.current.length) {
        focusWithoutScrolling(toasts.current[prevToast]);
      } else if (nextToast >= 0 && nextToast < toasts.current.length) {
        focusWithoutScrolling(toasts.current[nextToast]);
      }
    }

    prevVisibleToasts.current = state.visibleToasts;
  }, [state.visibleToasts, ref]);

  let lastFocused = useRef(null);
  let {focusWithinProps} = useFocusWithin({
    onFocusWithin: (e) => {
      state.pauseAll();
      lastFocused.current = e.relatedTarget;
    },
    onBlurWithin: () => {
      state.resumeAll();
      lastFocused.current = null;
    }
  });

  // When the region unmounts, restore focus to the last element that had focus
  // before the user moved focus into the region. FocusScope restore focus doesn't
  // update whenever the focus moves in, it only happens once, so we correct it.
  useEffect(() => {
    return () => {
      if (lastFocused.current && document.body.contains(lastFocused.current)) {
        if (getInteractionModality() === 'pointer') {
          focusWithoutScrolling(lastFocused.current);
        } else {
          lastFocused.current.focus();
        }
      }
    };
  }, [ref]);

  return {
    regionProps: mergeProps(landmarkProps, hoverProps, focusWithinProps, {
      tabIndex: -1,
      // Mark the toast region as a "top layer", so that it:
      //   - is not aria-hidden when opening an overlay
      //   - allows focus even outside a containing focus scope
      //   - doesn’t dismiss overlays when clicking on it, even though it is outside
      // @ts-ignore
      'data-react-aria-top-layer': true,
      // listen to focus events separate from focuswithin because that will only fire once
      // and we need to follow all focus changes
      onFocus: (e) => {
        let target = e.target.closest('[role="alertdialog"]');
        focusedToast.current = toasts.current.findIndex(t => t === target);
      },
      onBlur: () => {
        focusedToast.current = -1;
      }
    })
  };
}
