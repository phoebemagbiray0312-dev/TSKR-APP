// Expo Go on a Mac without Apple's command line tools (no Git) can't serve a project that is linked to
// EAS (projectId) and has expo-updates configured. Those settings are only added for EAS builds and `eas update`.
//   EAS cloud builds set EAS_BUILD=true automatically.
//   On the Mac, run EAS commands with TSKR_UPDATES=1 (see mobile/README-builds.md).
module.exports = ({ config }) => {
  const useEas = process.env.EAS_BUILD === 'true' || process.env.TSKR_UPDATES === '1';
  if (useEas) return config;
  const { updates, runtimeVersion, extra = {}, ...rest } = config;
  const { eas, ...extraRest } = extra;
  return { ...rest, extra: extraRest };
};
