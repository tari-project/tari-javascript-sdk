/**
 * Node.js native module transformer for Jest
 * Transforms .node files for testing environments
 */

module.exports = {
  process() {
    return {
      code: `
        const { getMockNativeBindings } = require('../tests/mocks/native-module.js');
        module.exports = getMockNativeBindings();
      `,
    };
  },
  getCacheKey() {
    return 'node-transform';
  },
};
