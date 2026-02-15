#!/usr/bin/env node

import { createProgram } from "./cli.js";
import { logger } from "./utils/logger.js";

const program = createProgram();

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof Error) {
    logger.error(error.message);
  } else {
    logger.error("An unexpected error occurred.");
  }
  process.exit(1);
});
