/**
 * Legacy entry point — redirects to cli/index.ts
 *
 * This file exists for backward compatibility with `npm start`.
 * All logic has moved to src/server.ts and src/cli/*.ts.
 */

import { main } from './cli/index.js';

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
