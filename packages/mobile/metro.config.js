const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    // Add html to asset extensions so we can require() the bridge HTML
    assetExts: [...defaultConfig.resolver.assetExts, "html"],
  },
};

module.exports = mergeConfig(defaultConfig, config);
