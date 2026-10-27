import { OptionSheet, type OptionSheetOption } from '@/components';

import type { ImageSource } from '../pickImage';
import type { ImageKind } from '../types';

export type ImageEditAction = ImageSource | 'remove';

const TITLE: Record<ImageKind, string> = { avatar: 'Foto de perfil', banner: 'Capa' };
const REMOVE_LABEL: Record<ImageKind, string> = { avatar: 'Remover foto', banner: 'Remover capa' };

export type ImageEditMenuProps = {
  visible: boolean;
  /** The image being edited; it stays set while the menu slides away. */
  kind: ImageKind;
  /** Whether the preview shows an image, saved or picked: only then can it be removed. */
  canRemove: boolean;
  onSelect: (kind: ImageKind, action: ImageEditAction) => void;
  onClose: () => void;
};

/** Câmera, Galeria and, when there is an image, a red "Remover capa" or "Remover foto". */
export function ImageEditMenu({ visible, kind, canRemove, onSelect, onClose }: ImageEditMenuProps) {
  const options: OptionSheetOption<ImageEditAction>[] = [
    { value: 'camera', label: 'Câmera', icon: 'camera-outline' },
    { value: 'library', label: 'Galeria', icon: 'image-outline' },
  ];
  if (canRemove) {
    options.push({
      value: 'remove',
      label: REMOVE_LABEL[kind],
      icon: 'trash-outline',
      destructive: true,
    });
  }
  return (
    <OptionSheet
      visible={visible}
      title={TITLE[kind]}
      options={options}
      onSelect={(action) => onSelect(kind, action)}
      onClose={onClose}
    />
  );
}
