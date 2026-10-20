import { Platform } from 'react-native';

type ApiPlatform = 'android' | 'ios' | 'web';

const DEFAULT_ANDROID_URL = 'http://10.0.2.2:3000';
const DEFAULT_LOCAL_URL = 'http://localhost:3000';

export function resolveApiBaseUrl(raw: string | undefined, platform: ApiPlatform): string {
  const fallback = platform === 'android' ? DEFAULT_ANDROID_URL : DEFAULT_LOCAL_URL;
  const configured = raw?.trim();
  const base = (configured ? configured : fallback).replace(/\/+$/, '').replace(/\/api$/, '');
  return `${base}/api`;
}

function currentPlatform(): ApiPlatform {
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
}

// EXPO_PUBLIC_* must be referenced literally so Expo can inline it at build time.
export const apiBaseUrl: string = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_URL,
  currentPlatform(),
);
