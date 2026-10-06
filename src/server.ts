import handler from '@tanstack/react-start/server-entry';

import { paraglideMiddleware } from './paraglide/server.js';

export default {
  fetch(req: Request): Response | Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req));
  },
};
