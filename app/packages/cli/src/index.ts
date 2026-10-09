#!/usr/bin/env node
import { CommanderError } from "commander";
import { applyMessageLang, createProgram, handleCommanderError, printError } from "./program.js";

applyMessageLang(process.argv);

const program = createProgram();

// トップレベル await は使わない（単一実行ファイル化のため CJS バンドルにする都合）。
program.parseAsync(process.argv).catch((error) => {
  if (error instanceof CommanderError) handleCommanderError(error);
  printError((error as Error).message);
  process.exit(1);
});
