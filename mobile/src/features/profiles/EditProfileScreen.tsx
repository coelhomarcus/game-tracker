import { usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { Avatar, Button, ConfirmDialog, Screen, Text, TextField } from '@/components';
import { authErrorMessage, useSession } from '@/features/auth';
import { countGraphemes } from '@/lib/graphemes';
import { ApiError } from '@/lib/http/errors';
import { resolveImageUrl } from '@/lib/imageUrl';
import { showToast } from '@/lib/toast';
import { colors, radii, space } from '@/theme/tokens';

import { pickImage } from './pickImage';
import {
  BIO_MAX,
  exceedsImageLimit,
  profileChanges,
  validateProfile,
  type ProfileErrors,
  type ProfileFields,
} from './profileRules';
import { useProfile, useUpdateProfile, useUploadImage } from './queries';
import type { ImageKind, PickedImage } from './types';

const AVATAR_SIZE = 96;
const WAIT_FOR_UPLOAD = 'Aguarde o envio da imagem terminar.';
const UPLOADED_TOAST: Record<ImageKind, string> = {
  avatar: 'Foto atualizada',
  banner: 'Capa atualizada',
};

/** What the photos section shows under the previews; a retry exists only for failed uploads. */
type PhotoProblem = { message: string; retry?: () => void };

function Section({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
          {title}
        </Text>
        <Text size="sm" tone="medium">
          {helper}
        </Text>
      </View>
      {children}
    </View>
  );
}

function UploadingOverlay({ round }: { round?: boolean }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.overlay, round ? styles.overlayRound : null]}
    >
      <ActivityIndicator color={colors.primary} />
      <Text size="xs" tone="high" style={styles.overlayLabel}>
        Enviando imagem…
      </Text>
    </View>
  );
}

export function EditProfileScreen() {
  const router = useRouter();
  const user = useSession((state) => state.user);
  const profile = useProfile(user?.id).data;
  const update = useUpdateProfile();
  const upload = useUploadImage();

  const source = profile ?? user;
  const initial: ProfileFields = {
    name: source?.name ?? '',
    username: source?.username ?? '',
    bio: source?.bio ?? '',
  };

  // Only what the user typed is kept; untouched fields follow the profile as it loads.
  const [edits, setEdits] = useState<Partial<ProfileFields>>({});
  const current: ProfileFields = { ...initial, ...edits };
  const [fieldErrors, setFieldErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);

  const [uploading, setUploading] = useState<ImageKind | null>(null);
  const [problem, setProblem] = useState<PhotoProblem | null>(null);
  // The URL an upload just returned; it shows at once, before the cache is read again.
  const [fresh, setFresh] = useState<Partial<Record<ImageKind, string>>>({});
  const picking = useRef(false);

  const changes = profileChanges(initial, current);
  const dirty = Object.keys(changes).length > 0 && !saved;
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => {
    setLeave(() => repeat);
  });

  const name = initial.name.trim() || initial.username;
  const bannerUrl = resolveImageUrl(fresh.banner ?? source?.bannerUrl);
  const avatarUrl = resolveImageUrl(fresh.avatar ?? source?.avatarUrl);
  const busy = uploading !== null;

  function edit(field: keyof ProfileFields, value: string) {
    setEdits((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  async function send(kind: ImageKind, image: PickedImage) {
    if (exceedsImageLimit(image.size)) {
      setProblem({ message: 'A imagem passa de 8 MB. Escolha uma menor.' });
      return;
    }
    setProblem(null);
    setUploading(kind);
    try {
      const url = await upload.mutateAsync({ kind, image });
      setFresh((previous) => ({ ...previous, [kind]: url }));
      showToast(UPLOADED_TOAST[kind]);
    } catch (error) {
      setProblem({ message: authErrorMessage(error), retry: () => void send(kind, image) });
    } finally {
      setUploading(null);
      setFormError((message) => (message === WAIT_FOR_UPLOAD ? null : message));
    }
  }

  async function choose(kind: ImageKind) {
    if (picking.current || busy) return;
    picking.current = true;
    setProblem(null);
    try {
      const image = await pickImage(kind, () =>
        setProblem({ message: 'Permita o acesso às fotos para escolher uma imagem.' }),
      );
      if (image) await send(kind, image);
    } finally {
      picking.current = false;
    }
  }

  async function save() {
    if (saving) return;
    setFormError(null);
    if (busy) {
      setFormError(WAIT_FOR_UPLOAD);
      return;
    }
    if (Object.keys(changes).length === 0) {
      router.back();
      return;
    }
    // A field the user did not touch is never blocked by what it already held.
    const found = validateProfile(current);
    const errors: ProfileErrors = {};
    for (const field of Object.keys(changes) as (keyof ProfileFields)[]) {
      if (found[field]) errors[field] = found[field];
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await update.mutateAsync(changes);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setFieldErrors({ username: 'Esse username já está em uso' });
      } else {
        setFormError(authErrorMessage(error));
      }
      setSaving(false);
      return;
    }
    setSaved(true);
    disablePrevention();
    showToast('Perfil atualizado');
    router.back();
  }

  function discard() {
    const repeat = leave;
    setLeave(null);
    setSaved(true);
    repeat?.();
  }

  return (
    <Screen scroll>
      <View style={styles.form}>
        <Section title="Fotos" helper="Salvas ao confirmar o recorte.">
          <View style={styles.preview}>
            {bannerUrl ? (
              <Image
                accessibilityRole="image"
                accessibilityLabel="Capa"
                source={{ uri: bannerUrl }}
                style={styles.banner}
              />
            ) : (
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel="Sem capa"
                style={styles.banner}
              />
            )}
            {uploading === 'banner' ? <UploadingOverlay /> : null}
          </View>
          <Button
            label="Alterar capa"
            color="secondary"
            disabled={busy}
            onPress={() => void choose('banner')}
          />
          <View style={styles.avatarRow}>
            <View style={styles.preview}>
              <Avatar uri={avatarUrl} name={name} size={AVATAR_SIZE} />
              {uploading === 'avatar' ? <UploadingOverlay round /> : null}
            </View>
            <View style={styles.avatarAction}>
              <Button
                label="Alterar foto"
                color="secondary"
                disabled={busy}
                onPress={() => void choose('avatar')}
              />
            </View>
          </View>
          {problem ? (
            <View style={styles.problem}>
              <Text accessibilityLiveRegion="polite" size="sm" tone="danger">
                {problem.message}
              </Text>
              {problem.retry ? (
                <Button label="Tentar de novo" color="secondary" onPress={problem.retry} />
              ) : null}
            </View>
          ) : null}
        </Section>

        <Section title="Informações" helper="Salvas no botão Salvar alterações.">
          <TextField
            label="Nome"
            value={current.name}
            onChangeText={(text) => edit('name', text)}
            error={fieldErrors.name}
            autoComplete="name"
          />
          <TextField
            label="Username"
            helper="Letras, números e _"
            value={current.username}
            onChangeText={(text) => edit('username', text)}
            error={fieldErrors.username}
            autoCapitalize="none"
            autoComplete="username"
          />
          <View style={styles.bio}>
            <TextField
              label="Bio"
              multiline
              placeholder="Conte um pouco sobre você"
              value={current.bio}
              onChangeText={(text) => edit('bio', text)}
              error={fieldErrors.bio}
            />
            <Text size="xs" tone="medium" style={styles.counter}>{`${countGraphemes(current.bio)}/${BIO_MAX}`}</Text>
          </View>
        </Section>

        {formError ? (
          <Text accessibilityLiveRegion="polite" size="sm" tone="danger">
            {formError}
          </Text>
        ) : null}
        <Button label="Salvar alterações" loading={saving} onPress={() => void save()} />
      </View>

      <ConfirmDialog
        visible={leave !== null}
        title="Descartar alterações?"
        message="Nome, username e bio não foram salvos. Fotos que você já enviou continuam salvas."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        destructive
        onConfirm={discard}
        onCancel={() => setLeave(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { padding: space.lg, gap: space._2xl },
  section: { gap: space.md },
  sectionHead: { gap: space.xs },
  preview: { position: 'relative' },
  banner: {
    width: '100%',
    aspectRatio: 3,
    borderRadius: radii.md,
    backgroundColor: colors.bgContrast50,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatarAction: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radii.md,
    backgroundColor: `${colors.bg}CC`,
  },
  overlayRound: { borderRadius: AVATAR_SIZE / 2 },
  overlayLabel: {
    textAlign: 'center',
    paddingHorizontal: space.xs,
  },
  problem: { gap: space.sm },
  bio: { gap: space.xs },
  counter: { alignSelf: 'flex-end' },
});
