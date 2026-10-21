import { Button } from '@/components';

import { useToggleFollow } from './queries';

export type FollowButtonProps = {
  userId: string;
  following: boolean;
  name: string;
};

export function FollowButton({ userId, following, name }: FollowButtonProps) {
  const toggle = useToggleFollow();
  return (
    <Button
      label={following ? 'Seguindo' : 'Seguir'}
      accessibilityLabel={following ? `Deixar de seguir ${name}` : `Seguir ${name}`}
      variant={following ? 'secondary' : 'primary'}
      onPress={() => toggle.mutate({ id: userId, follow: !following })}
    />
  );
}
