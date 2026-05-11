import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startScheduler } from "./jobs/scheduler.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`collectrics-api listening on http://localhost:${env.PORT}`);
});

startScheduler();
