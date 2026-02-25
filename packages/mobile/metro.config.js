const path = require("path");
const fs = require("fs");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const defaultConfig = getDefaultConfig(__dirname);

// Monorepo root
const monorepoRoot = path.resolve(__dirname, "../..");

const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    // Add html to asset extensions so we can require() the bridge HTML
    assetExts: [...defaultConfig.resolver.assetExts, "html"],
    // Let metro find packages in the monorepo root node_modules
    nodeModulesPaths: [
      path.resolve(__dirname, "node_modules"),
      path.resolve(monorepoRoot, "node_modules"),
    ],
    // Block metro from crawling into unrelated monorepo packages
    blockList: [
      /packages\/nextjs\/.*/,
      /packages\/extension\/.*/,
      /packages\/snfoundry\/.*/,
    ],
    // Handle .js → .ts resolution for tongo-sdk source files
    resolveRequest: (context, moduleName, platform) => {
      // Let default resolution try first
      try {
        return context.resolveRequest(context, moduleName, platform);
      } catch (e) {
        // If module ends with .js and wasn't found, try .ts
        if (moduleName.endsWith(".js")) {
          const tsName = moduleName.replace(/\.js$/, ".ts");
          try {
            return context.resolveRequest(context, tsName, platform);
          } catch (e2) {
            // Fall through to throw original error
          }
        }
        throw e;
      }
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
