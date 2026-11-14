// Expo Go on a Mac without Apple's command line tools (no Git) can't serve a project that has
// expo-updates configured. So the update settings are only added for EAS builds and `eas update`.
//   EAS cloud builds set EAS_BUILD=true automatically.
//   On the Mac, run EAS commands with TSKR_UPDATES=1 (see mobile/README-builds.md).
module.exports = ({ config }) => {
  const useUpdates = process.env.EAS_BUILD === 'true' || process.env.TSKR_UPDATES === '1';
  if (useUpdates) return config;
  const { updates, runtimeVersion, ...rest } = config;
  return rest;
};
