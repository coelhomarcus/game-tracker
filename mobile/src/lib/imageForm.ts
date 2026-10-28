import { File } from 'expo-file-system';
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
    // Expo's fetch (the global one) cannot read React Native's `{ uri, name, type }` descriptor and
    // fails the request; a File reads the picked file itself and brings its own name and type.
    form.append(field, new File(image.uri));
  }
  return form;
}
