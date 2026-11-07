import { createApp } from './app';
import { appConfig } from './config/app.config';
import { logger } from './lib/logger';

const app = createApp(appConfig);

app.listen(appConfig.port, () => {
  logger.info(`${appConfig.appName} API berjalan`, {
    port: appConfig.port,
    env: appConfig.env,
  });
});
