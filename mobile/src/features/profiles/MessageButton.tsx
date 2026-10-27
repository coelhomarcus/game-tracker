import { useRouter, type Href } from 'expo-router';
import { useRef } from 'react';

import { Button } from '@/components';
import { authErrorMessage } from '@/features/auth';
import { useStartConversation } from '@/features/chat/queries';
import { showToast } from '@/lib/toast';

export type MessageButtonProps = {
  userId: string;
  name: string;
  /** `false` when the person's privacy settings or a block rule messages out: nothing to show. */
  canMessage?: boolean;
};

/** A round icon button that finds or creates the conversation with the user and opens it. */
export function MessageButton({ userId, name, canMessage = true }: MessageButtonProps) {
  const router = useRouter();
  const start = useStartConversation();
  const starting = useRef(false);

  async function open() {
    if (starting.current) return;
    starting.current = true;
    try {
      const id = await start.mutateAsync(userId);
      router.push(`/chat/${id}` as Href);
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      starting.current = false;
    }
  }

  if (!canMessage) return null;

  return (
    <Button
      icon="chatbubble-outline"
      shape="round"
      size="small"
      accessibilityLabel={`Enviar mensagem para ${name}`}
      color="secondary"
      disabled={start.isPending}
      onPress={() => void open()}
    />
  );
}
