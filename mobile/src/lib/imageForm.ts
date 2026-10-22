import { Platform } from 'react-native';

/** An image chosen with the system picker, ready to upload. */
export type UploadableImage = {
  uri: string;
  mimeType: string;
  fileName: string;
};

/** A multipart body with the image under `field`. */
export async function imageForm(field: string, image: UploadableImage): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // The browser picker yields a blob: or data: URI, not a file path.
    const blob = await (await fetch(image.uri)).blob();
    form.append(field, blob, image.fileName);
  } else {
    // React Native reads the file itself from this descriptor.
    form.append(field, {
      uri: image.uri,
      name: image.fileName,
      type: image.mimeType,
    } as unknown as Blob);
  }
  return form;
}
