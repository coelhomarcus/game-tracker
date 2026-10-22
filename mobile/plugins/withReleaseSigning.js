// Signs the Android release build with the keystore given through the environment, so that
// `expo prebuild` output (generated at build time and never committed) can be released.
//
//   GT_STORE_FILE, GT_STORE_PASSWORD, GT_KEY_ALIAS, GT_KEY_PASSWORD  signing keystore
//   GT_REQUIRE_RELEASE_SIGNING=1                                      fail instead of debug-signing
//
// Without GT_STORE_FILE the release build falls back to the debug key, which is only meant for
// local experiments: the release workflow sets GT_REQUIRE_RELEASE_SIGNING and rejects debug keys.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// gametracker release signing';

const SIGNING_BLOCK = `    ${MARKER}
    signingConfigs {
        if (System.getenv('GT_STORE_FILE')) {
            release {
                storeFile file(System.getenv('GT_STORE_FILE'))
                storePassword System.getenv('GT_STORE_PASSWORD')
                keyAlias System.getenv('GT_KEY_ALIAS')
                keyPassword System.getenv('GT_KEY_PASSWORD')
            }
        } else if (System.getenv('GT_REQUIRE_RELEASE_SIGNING') == '1') {
            throw new GradleException('GT_REQUIRE_RELEASE_SIGNING is set but GT_STORE_FILE is missing')
        }
    }
`;

function applyReleaseSigning(contents) {
  if (contents.includes(MARKER)) return contents;

  const buildTypes = '    buildTypes {';
  if (!contents.includes(buildTypes)) {
    throw new Error('withReleaseSigning: buildTypes block not found in app/build.gradle');
  }
  const releaseDebugSigning = /(release \{[^}]*?)signingConfig signingConfigs\.debug/;
  if (!releaseDebugSigning.test(contents)) {
    throw new Error('withReleaseSigning: release signingConfig not found in app/build.gradle');
  }

  return contents
    .replace(buildTypes, `${SIGNING_BLOCK}${buildTypes}`)
    .replace(
      releaseDebugSigning,
      "$1signingConfig System.getenv('GT_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = applyReleaseSigning(modConfig.modResults.contents);
    return modConfig;
  });
};

module.exports.applyReleaseSigning = applyReleaseSigning;
