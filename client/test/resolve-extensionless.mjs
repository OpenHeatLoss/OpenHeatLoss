// client/test/resolve-extensionless.mjs
//
// Loaded with `node --import` by `npm test`. The client code uses Vite-style
// extensionless imports ('./en12831VentilationData'); teach Node to resolve
// those to .js so the tests run the real modules, unmodified. Same hook as
// scripts/b25_baseline.mjs.

import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !specifier.endsWith('.js')) {
        return nextResolve(specifier + '.js', context);
      }
      throw err;
    }
  },
});
