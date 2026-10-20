import { create } from 'zustand';

const TOAST_DURATION_MS = 3000;

type ToastState = { message: string | null };

export const useToast = create<ToastState>(() => ({ message: null }));

let timer: ReturnType<typeof setTimeout> | undefined;

function clearTimer() {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

/** Shows a transient message, replacing the current one and restarting the 3 s countdown. */
export function showToast(message: string) {
  clearTimer();
  useToast.setState({ message });
  timer = setTimeout(hideToast, TOAST_DURATION_MS);
}

export function hideToast() {
  clearTimer();
  useToast.setState({ message: null });
}
