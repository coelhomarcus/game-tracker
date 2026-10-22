// Extends app.json with values the release workflow supplies at build time:
//   APP_VERSION   the SemVer calculated from the commit history (version / versionName)
//   BUILD_NUMBER  the Android versionCode
// Outside the release workflow both are unset and app.json is used as is.
module.exports = ({ config }) => {
  const buildNumber = Number.parseInt(process.env.BUILD_NUMBER ?? '', 10);
  return {
    ...config,
    version: process.env.APP_VERSION || config.version,
    android: {
      ...config.android,
      ...(Number.isInteger(buildNumber) && buildNumber > 0 ? { versionCode: buildNumber } : {}),
    },
    plugins: [...(config.plugins ?? []), './plugins/withReleaseSigning'],
  };
};
