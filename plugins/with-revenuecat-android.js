const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withRevenueCatAndroid(config) {
  return withAndroidManifest(config, (result) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(result.modResults);
    mainActivity.$['android:launchMode'] = 'singleTop';
    return result;
  });
};
