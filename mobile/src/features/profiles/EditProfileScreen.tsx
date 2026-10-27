import { Stack, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { ConfirmDialog, Screen, Text, TextField } from '@/components';
import { authErrorMessage, useSession } from '@/features/auth';
import { countGraphemes } from '@/lib/graphemes';
import { haptic } from '@/lib/haptics';
import { ApiError } from '@/lib/http/errors';
import { resolveImageUrl } from '@/lib/imageUrl';
import { showToast } from '@/lib/toast';
import { space } from '@/theme/tokens';

import { EditImages } from './edit/EditImages';
import { EditProfileTopBar } from './edit/EditProfileTopBar';
import {
  canRemove,
  canSave,
  completeStep,
  currentFields,
  editField,
  EMPTY_EDITS,
  fieldErrors,
  isDirty,
  pickImageEdit,
  previewUri,
  removeImageEdit,
  savePlan,
  type EditProfileState,
  type SavedProfile,
  type SaveStep,
} from './edit/editProfileState';
import { ImageEditMenu, type ImageEditAction } from './edit/ImageEditMenu';
import { pickImage, type ImageSource } from './pickImage';
import { BIO_MAX, exceedsImageLimit, NAME_MAX, type ProfileFields } from './profileRules';
import { useProfile, useRemoveImage, useUpdateProfile, useUploadImage } from './queries';
import type { ImageKind } from './types';

const BIO_MIN_HEIGHT = 80;
const FIELDS_TOP = 32;
const FIELDS_GAP = 20;
const FIELDS_SIDE = 20;

const USERNAME_TAKEN = 'Esse username já está em uso';
const IMAGE_TOO_BIG = 'A imagem passa de 8 MB. Escolha uma menor.';
const IMAGE_REFUSED = 'Imagem inválida ou grande demais. Escolha outra.';
const OPEN_FAILED: Record<ImageSource, string> = {
  camera: 'Não foi possível abrir a câmera. Tente de novo.',
  library: 'Não foi possível abrir a galeria. Tente de novo.',
};

/** Why a step of the save stopped, as the line under the top bar says it. */
function stepErrorMessage(step: SaveStep, error: unknown): string {
  // The server refuses the file itself (format, size): sending it again would fail again.
  const refused =
    error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429;
  if (step.type === 'upload' && refused) return IMAGE_REFUSED;
  return authErrorMessage(error);
}

function Field({
  label,
  count,
  max,
  children,
}: {
  label: string;
  /** With `max`: the counter under the field. */
  count?: number;
  max?: number;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text size="sm" weight="semibold" tone="medium">
        {label}
      </Text>
      {children}
      {count !== undefined && max !== undefined ? (
        <Text size="sm" tone={count > max ? 'danger' : 'low'} style={styles.counter}>
          {`${count}/${max}`}
        </Text>
      ) : null}
    </View>
  );
}

type Menu = { open: boolean; kind: ImageKind; removable: boolean };

/**
 * "Editar perfil": a full-screen sheet. Images and fields stay on the device until Salvar, which
 * sends the new images, then the removals, then the fields. A step that fails stops the save and
 * keeps the rest for the next Salvar; what the server already accepted is not sent again.
 */
export function EditProfileScreen() {
  const router = useRouter();
  const user = useSession((state) => state.user);
  const profile = useProfile(user?.id).data;
  const update = useUpdateProfile();
  const upload = useUploadImage();
  const remove = useRemoveImage();

  const source = profile ?? user;
  const saved: SavedProfile = {
    fields: {
      name: source?.name ?? '',
      username: source?.username ?? '',
      bio: source?.bio ?? '',
    },
    images: { avatar: source?.avatarUrl ?? null, banner: source?.bannerUrl ?? null },
  };

  const [edits, setEdits] = useState<EditProfileState>(EMPTY_EDITS);
  // The latest edits, for the save loop that outlives the render it started in.
  const latest = useRef(edits);
  const commit = useCallback((change: (state: EditProfileState) => EditProfileState) => {
    latest.current = change(latest.current);
    setEdits(latest.current);
  }, []);

  const [saving, setSaving] = useState(false);
  // Saved or discarded: the sheet is closing and must not ask again.
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The username the server refused as taken; the error shows while the field still holds it.
  const [takenUsername, setTakenUsername] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>({ open: false, kind: 'avatar', removable: false });
  const [leave, setLeave] = useState<(() => void) | null>(null);
  // Set synchronously, so a second tap before the next render does not save twice.
  const sending = useRef(false);
  const picking = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fields = currentFields(edits, saved);
  const errors = fieldErrors(edits, saved);
  const usernameTaken = takenUsername !== null && fields.username.trim() === takenUsername;
  if (usernameTaken && !errors.username) errors.username = USERNAME_TAKEN;
  const ready = canSave(edits, saved, saving) && !usernameTaken;
  const dirty = isDirty(edits, saved) && !done;

  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => {
    // Android back while the save is going out: stay, the save decides what happens next.
    if (sending.current) return;
    setLeave(() => repeat);
  });

  const name = fields.name.trim() || fields.username;

  function edit(field: keyof ProfileFields, value: string) {
    commit((state) => editField(state, field, value));
  }

  function openMenu(kind: ImageKind) {
    setMenu({ open: true, kind, removable: canRemove(latest.current, saved, kind) });
  }

  /** The system picker or camera takes over the screen; one at a time. */
  async function choose(kind: ImageKind, from: ImageSource) {
    if (picking.current || sending.current) return;
    picking.current = true;
    try {
      const image = await pickImage(kind, from);
      if (image === null) return;
      if (exceedsImageLimit(image.size)) {
        showToast(IMAGE_TOO_BIG);
        return;
      }
      commit((state) => pickImageEdit(state, kind, image));
    } catch {
      showToast(OPEN_FAILED[from]);
    } finally {
      picking.current = false;
    }
  }

  function onMenuSelect(kind: ImageKind, action: ImageEditAction) {
    if (action === 'remove') commit((state) => removeImageEdit(state, kind));
    else void choose(kind, action);
  }

  async function run(step: SaveStep) {
    switch (step.type) {
      case 'upload':
        await upload.mutateAsync({ kind: step.kind, image: step.image });
        return;
      case 'remove':
        await remove.mutateAsync(step.kind);
        return;
      case 'patch':
        await update.mutateAsync(step.changes);
        return;
    }
  }

  async function save() {
    if (sending.current || !ready) return;
    sending.current = true;
    setSaving(true);
    setFormError(null);
    for (const step of savePlan(latest.current, saved)) {
      try {
        await run(step);
      } catch (error) {
        sending.current = false;
        if (!mounted.current) return;
        setSaving(false);
        const taken =
          step.type === 'patch' &&
          step.changes.username !== undefined &&
          error instanceof ApiError &&
          error.status === 409;
        if (taken) {
          setTakenUsername(step.changes.username ?? null);
        } else {
          setFormError(stepErrorMessage(step, error));
        }
        return;
      }
      // The server holds this step now: a retry leaves it out.
      commit((state) => completeStep(state, step));
    }
    if (!mounted.current) return;
    setDone(true);
    disablePrevention();
    haptic('confirm');
    showToast('Perfil atualizado');
    router.back();
  }

  function discard() {
    const repeat = leave;
    setLeave(null);
    setDone(true);
    repeat?.();
  }

  const avatarUri = resolveImageUrl(previewUri(edits, saved, 'avatar'));
  const bannerUri = resolveImageUrl(previewUri(edits, saved, 'banner'));

  return (
    <Screen topInset>
      {/* With changes, the sheet does not close with a gesture; leaving asks first. */}
      <Stack.Screen options={{ gestureEnabled: !dirty }} />
      <EditProfileTopBar
        canSave={ready}
        saving={saving}
        onCancel={() => router.back()}
        onSave={() => void save()}
      >
        {formError ? (
          <Text accessibilityLiveRegion="polite" size="sm" tone="danger" style={styles.error}>
            {formError}
          </Text>
        ) : null}
      </EditProfileTopBar>

      <KeyboardAwareScrollView
        bottomOffset={space.lg}
        style={styles.fill}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <EditImages
          bannerUri={bannerUri}
          avatarUri={avatarUri}
          name={name}
          disabled={saving}
          onEdit={openMenu}
        />

        <View style={styles.fields}>
          <Field label="Nome" count={countGraphemes(fields.name.trim())} max={NAME_MAX}>
            <TextField
              label="Nome"
              hideLabel
              editable={!saving}
              value={fields.name}
              onChangeText={(text) => edit('name', text)}
              error={errors.name}
              autoComplete="name"
            />
          </Field>
          <Field label="Nome de usuário">
            <TextField
              label="Nome de usuário"
              hideLabel
              editable={!saving}
              helper="Letras, números e _"
              value={fields.username}
              onChangeText={(text) => edit('username', text)}
              error={errors.username}
              autoCapitalize="none"
              autoComplete="username"
            />
          </Field>
          <Field label="Bio" count={countGraphemes(fields.bio.trim())} max={BIO_MAX}>
            <TextField
              label="Bio"
              hideLabel
              editable={!saving}
              multiline
              minHeight={BIO_MIN_HEIGHT}
              placeholder="Conte um pouco sobre você"
              value={fields.bio}
              onChangeText={(text) => edit('bio', text)}
              error={errors.bio}
            />
          </Field>
        </View>
      </KeyboardAwareScrollView>

      <ImageEditMenu
        visible={menu.open}
        kind={menu.kind}
        canRemove={menu.removable}
        onSelect={onMenuSelect}
        onClose={() => setMenu((current) => ({ ...current, open: false }))}
      />
      <ConfirmDialog
        visible={leave !== null}
        title="Descartar alterações?"
        message="Suas alterações não serão salvas."
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
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: space._2xl },
  error: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  fields: {
    marginTop: FIELDS_TOP,
    paddingHorizontal: FIELDS_SIDE,
    gap: FIELDS_GAP,
  },
  field: { gap: space.xs },
  counter: { alignSelf: 'flex-end' },
});
