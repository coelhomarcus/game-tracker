# GameTracker Android client

Flutter Android client for GameTracker. Decisions, history, and remaining work: [`docs/MIGRACAO_FLUTTER.md`](../docs/MIGRACAO_FLUTTER.md).

```bash
flutter pub get
flutter analyze
flutter test
flutter run                   # Android device or emulator
flutter build apk --debug      # Android
```

Testes de integração contra o backend de **teste** (nunca produção). Suba antes: `cd ../backend && npm run test:db:up && npm run test:seed && npm run dev:test` (veja o README da raiz).:

```bash
flutter test test/integration --dart-define=GT_BACKEND=http://localhost:3100
```

API URL: `--dart-define=API_URL=https://...` (default: `http://localhost:3100`, or `http://10.0.2.2:3100` on the Android emulator).

Estado: autenticação, catálogo, biblioteca, comunidade, perfis, configurações, chat em tempo real e central de notificações reais (Etapas 3 a 8). Build de release assinado: `tool/build_release.sh`; critérios e pendências em `docs/MIGRACAO_FLUTTER.md`. Push com o app fechado está fora desta entrega (sem Firebase); o cliente já tem a interface pronta para o adaptador FCM.
