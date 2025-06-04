#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const platforms = [
  { platform: 'darwin', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'linux', arch: 'x64' },
  { platform: 'linux', arch: 'arm64' },
  { platform: 'win32', arch: 'x64' },
];

const nodeVersions = ['16.0.0', '18.0.0', '20.0.0'];

async function main() {
  const prebuildsDir = path.join(__dirname, '..', 'prebuilds');
  
  // Clean prebuilds directory
  if (fs.existsSync(prebuildsDir)) {
    fs.rmSync(prebuildsDir, { recursive: true });
  }
  fs.mkdirSync(prebuildsDir, { recursive: true });

  for (const { platform, arch } of platforms) {
    for (const nodeVersion of nodeVersions) {
      console.log(`\nBuilding for ${platform}-${arch} Node ${nodeVersion}`);
      
      try {
        // Build native module
        execSync(`node scripts/build-native.js`, {
          stdio: 'inherit',
          cwd: path.join(__dirname, '..'),
          env: {
            ...process.env,
            npm_config_target: nodeVersion,
            npm_config_arch: arch,
            npm_config_platform: platform,
          },
        });

        // Create prebuild
        const prebuildName = `${platform}-${arch}-napi-v6.node`;
        const prebuildDir = path.join(prebuildsDir, `${platform}-${arch}`);
        
        fs.mkdirSync(prebuildDir, { recursive: true });
        
        fs.copyFileSync(
          path.join(__dirname, '..', 'native', 'index.node'),
          path.join(prebuildDir, prebuildName)
        );

        console.log(`Created prebuild: ${prebuildName}`);
      } catch (error) {
        console.error(`Failed to build for ${platform}-${arch}:`, error.message);
      }
    }
  }

  // Create prebuild manifest
  const manifest = {
    name: '@tari/core',
    version: require('../package.json').version,
    prebuilds: platforms.map(({ platform, arch }) => ({
      platform,
      arch,
      file: `${platform}-${arch}/index.node`,
    })),
  };

  fs.writeFileSync(
    path.join(prebuildsDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('\nAll prebuilds completed');
}

main().catch(console.error);
