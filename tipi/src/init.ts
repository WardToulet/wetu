import http from 'http';
import { PreloadFunc } from './preload';
import { Router } from './router';
import { listFilesInDirRecrusively } from './util';
import { HTTPMethod } from './httpHelpers';
import { createPipeline } from './pipeline';
import preCheck from './endpoint/preCheck';
import { postCheck } from '.';
import { Logger, simpleLogger, Log } from './log';

type InitProps = {
  endpoints: string,
  // All the preloads that run on the endpoints
  preload?: PreloadFunc[]
  logger?: Logger,
}

/**
 * Initializes wetu and returns a http router
 */
export default async function init({ 
  endpoints, 
  preload = [],
  logger = simpleLogger,
}: InitProps):
  Promise<(req: http.IncomingMessage, res: http.ServerResponse) => void>
{
  const router = new Router();

  const modules = (await listFilesInDirRecrusively(endpoints))
    .filter(x => x.match(/[a-zA-Z0-9]\.(js|ts)$/))
    .map(module => Promise.all([import(module), Promise.resolve(module)]));

    // If a preloadFunction throws the loading of the endpoint is canceled
    for(let [ module, filename ] of await Promise.all(modules)) {
      try {
        // Do prechecks
        preCheck(module);

        for(const preloadFunction of preload) {
          module = preloadFunction(module); 
        }

        // Do post checks
        postCheck(module);

        router.addEndpoint(module.path as string, module.method as HTTPMethod, createPipeline(module, filename));

        logger(new Log({
          level: 'LOG',
          message: `Mounted at ${(Array.isArray(module.path) ? module.path : [ module.path ]).map((x: string) => `"${x}"`).join(', ')}`,
          tag: module.name || filename.split('/').pop(),
        }));
      } catch(error) {
        if(error instanceof Log) {
          // Add the name of the endpoint
          error.addTag(module.name || filename.split('/').pop())
          logger(error);
        } else {
          console.error(error);
        }
      }
    }

  return router.handler.bind(router);
}
