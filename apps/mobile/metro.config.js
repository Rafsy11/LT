const path = require('path');

let getDefaultConfig;
try {
  getDefaultConfig = require('expo/metro-config').getDefaultConfig;
} catch {
  getDefaultConfig = () => ({
    resolver: { nodeModulesPaths: [] },
    watchFolders: [],
  });
}

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver = config.resolver || {};
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
