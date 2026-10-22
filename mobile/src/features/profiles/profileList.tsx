import type { RefObject } from 'react';

import { showToast } from '@/lib/toast';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';

export type Refetch = () => Promise<{ isError: boolean }>;

/**
 * Runs every refetch together. A refetch resolves with the error instead of throwing, so a
 * rejection and a failed result both count; the loaded data stays either way.
 */
export async function refreshAll(refetches: Refetch[]): Promise<void> {
  const failures = await Promise.all(
    refetches.map((refetch) =>
      refetch().then(
        (result) => result.isError,
        () => true,
      ),
    ),
  );
  if (failures.some(Boolean)) showToast('Não foi possível atualizar o perfil');
}

type Scrollable = { scrollToOffset(params: { offset: number; animated?: boolean }): void };

/** Renders nothing: it only wires the Perfil tab button to the list that is showing. */
export function ScrollToTopOnTabPress({ listRef }: { listRef: RefObject<Scrollable | null> }) {
  useScrollToTopOnTabPress(listRef);
  return null;
}
