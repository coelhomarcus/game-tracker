#!/usr/bin/env bash
# Gera o APK de release assinado, apontando para a API de produção.
#   API_URL=https://api.exemplo.com tool/build_release.sh
# Falha se a API não for HTTPS, se faltar android/key.properties ou se o APK sair assinado com
# a chave de debug. A URL da API e a versão são públicas; senhas e chaves NUNCA entram em --dart-define.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${API_URL:?defina API_URL (ex.: https://api.exemplo.com, sem /api no fim)}"
case "$API_URL" in
  https://*) ;;
  *) echo "API_URL precisa ser https:// (o Android bloqueia HTTP em release)" >&2; exit 1 ;;
esac
case "$API_URL" in
  */api|*/api/|*/) echo "API_URL não deve terminar em / nem /api: o app acrescenta /api" >&2; exit 1 ;;
esac

flutter pub get
BUILD_ARGS=(--release --dart-define=API_URL="$API_URL" -PrequireReleaseSigning=true)
if [ -n "${APP_VERSION:-}" ]; then
  BUILD_ARGS+=(--build-name="$APP_VERSION" --dart-define=APP_VERSION="$APP_VERSION")
fi
if [ -n "${BUILD_NUMBER:-}" ]; then
  BUILD_ARGS+=(--build-number="$BUILD_NUMBER")
fi
flutter build apk "${BUILD_ARGS[@]}"

APK=build/app/outputs/flutter-apk/app-release.apk
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
APKSIGNER=$(ls "$SDK"/build-tools/*/apksigner 2>/dev/null | sort | tail -1 || true)
if [ -n "$APKSIGNER" ]; then
  CERT=$("$APKSIGNER" verify --print-certs "$APK")
  echo "$CERT"
  if echo "$CERT" | grep -qi "Android Debug"; then
    echo "O APK está assinado com a chave de debug" >&2; exit 1
  fi
else
  echo "apksigner não encontrado: assinatura não conferida" >&2
fi
sha256sum "$APK" 2>/dev/null || shasum -a 256 "$APK"
