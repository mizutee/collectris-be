import { closePool } from "../db/pool.js";
import { refreshCoreData, refreshSearchIndex } from "../services/ingestService.js";

const mode = process.argv[2] ?? "all";

try {
  if (mode === "core") {
    await refreshCoreData();
  } else if (mode === "search") {
    await refreshSearchIndex();
  } else if (mode === "all") {
    await refreshCoreData();
    await refreshSearchIndex();
  } else {
    throw new Error(`Unknown refresh mode '${mode}'. Use core, search, or all.`);
  }

  console.log(`Refresh '${mode}' complete.`);
} finally {
  await closePool();
}
