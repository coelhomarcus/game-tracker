import { create } from 'zustand';

type SheetState = { open: boolean };

/**
 * Whether the new conversation sheet is open. The header button lives in the tab layout and the
 * sheet in the screen, so the two meet here.
 */
export const useNewConversationSheet = create<SheetState>(() => ({ open: false }));

export function openNewConversationSheet() {
  useNewConversationSheet.setState({ open: true });
}

export function closeNewConversationSheet() {
  useNewConversationSheet.setState({ open: false });
}
