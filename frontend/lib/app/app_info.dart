/// Version displayed in Settings. Release builds override it with APP_VERSION.
const appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0');
