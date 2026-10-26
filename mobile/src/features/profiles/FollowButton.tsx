import { Button, type ButtonSize } from '@/components';

import { useToggleFollow } from './queries';

export type FollowButtonProps = {
  userId: string;
  following: boolean;
  name: string;
  /** `small` beside a post's author, padded out to 48 dp of touch by the button. */
  size?: ButtonSize;
};

export function FollowButton({ userId, following, name, size }: FollowButtonProps) {
  const toggle = useToggleFollow();
  return (
    <Button
      label={following ? 'Seguindo' : 'Seguir'}
      accessibilityLabel={following ? `Deixar de seguir ${name}` : `Seguir ${name}`}
      color={following ? 'secondary' : 'primary'}
      size={size}
      onPress={() => toggle.mutate({ id: userId, follow: !following })}
    />
  );
}
