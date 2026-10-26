import { Button, type ButtonSize } from '@/components';

import { useToggleFollow } from './queries';

export type FollowButtonProps = {
  userId: string;
  following: boolean;
  name: string;
  /** `small` beside a post's author, padded out to 48 dp of touch by the button. */
  size?: ButtonSize;
  /** The person follows the viewer, so following them is "Seguir de volta". */
  followsMe?: boolean;
  /** A "+" before the label of the button that follows. */
  showIcon?: boolean;
  /** Confirms a follow with a toast ("Seguindo <nome>"). Unfollowing stays silent. */
  announce?: boolean;
};

export function FollowButton({
  userId,
  following,
  name,
  size,
  followsMe = false,
  showIcon = false,
  announce = false,
}: FollowButtonProps) {
  const toggle = useToggleFollow();
  const label = following ? 'Seguindo' : followsMe ? 'Seguir de volta' : 'Seguir';
  return (
    <Button
      label={label}
      accessibilityLabel={following ? `Deixar de seguir ${name}` : `Seguir ${name}`}
      color={following ? 'secondary' : 'primary'}
      icon={showIcon && !following ? 'add' : undefined}
      size={size}
      onPress={() => {
        const variables = { id: userId, follow: !following };
        // The toast waits for the server (a follow that fails is rolled back without a
        // "Seguindo"). The hook shows it, because this button may be gone by then.
        toggle.mutate(announce && !following ? { ...variables, announce: name } : variables);
      }}
    />
  );
}
