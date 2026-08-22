const isDevelopment = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => ({
  ...config,
  name: isDevelopment ? 'Wordfold (Dev)' : config.name,
  android: {
    ...config.android,
    package: isDevelopment ? 'com.jozefmajzel.wordfold.debug' : config.android.package,
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-dev-client',
      {
        addGeneratedScheme: isDevelopment,
      },
    ],
  ],
});
