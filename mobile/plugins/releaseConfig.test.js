const appConfig = require('../app.config');
const { applyReleaseSigning } = require('./withReleaseSigning');

const GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

describe('applyReleaseSigning', () => {
  it('signs the release build with the environment keystore and leaves debug on the debug key', () => {
    const result = applyReleaseSigning(GRADLE);

    expect(result).toContain("storeFile file(System.getenv('GT_STORE_FILE'))");
    expect(result).toContain(
      "signingConfig System.getenv('GT_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    const debugBlock = result.slice(result.indexOf('        debug {\n            signingConfig'));
    expect(debugBlock.startsWith('        debug {\n            signingConfig signingConfigs.debug')).toBe(
      true,
    );
  });

  it('can require release signing so a missing keystore fails the build', () => {
    expect(applyReleaseSigning(GRADLE)).toContain("System.getenv('GT_REQUIRE_RELEASE_SIGNING') == '1'");
  });

  it('is idempotent', () => {
    const once = applyReleaseSigning(GRADLE);
    expect(applyReleaseSigning(once)).toBe(once);
  });

  it('fails loudly when the generated gradle file has an unexpected shape', () => {
    expect(() => applyReleaseSigning('android {}')).toThrow('buildTypes block not found');
    expect(() => applyReleaseSigning('    buildTypes {\n        release {\n        }\n    }')).toThrow(
      'release signingConfig not found',
    );
  });
});

describe('app.config', () => {
  const base = { version: '1.0.0', android: { package: 'com.example' }, plugins: ['expo-router'] };
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('uses app.json as is without release variables', () => {
    delete process.env.APP_VERSION;
    delete process.env.BUILD_NUMBER;
    const config = appConfig({ config: base });

    expect(config.version).toBe('1.0.0');
    expect(config.android).toEqual({ package: 'com.example' });
  });

  it('takes the version and build number from the release workflow', () => {
    process.env.APP_VERSION = '1.2.3';
    process.env.BUILD_NUMBER = '142';
    const config = appConfig({ config: base });

    expect(config.version).toBe('1.2.3');
    expect(config.android).toEqual({ package: 'com.example', versionCode: 142 });
  });

  it('ignores a build number that is not a positive integer', () => {
    process.env.BUILD_NUMBER = 'abc';
    expect(appConfig({ config: base }).android).toEqual({ package: 'com.example' });
  });

  it('registers the signing plugin once', () => {
    expect(appConfig({ config: base }).plugins).toEqual(['expo-router', './plugins/withReleaseSigning']);
  });
});
