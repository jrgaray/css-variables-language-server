#!/usr/bin/env node

import { makeConnection } from "./connection";

const args = process.argv;

if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`${require("../package.json").version}`);
  process.exit(0);
}

makeConnection().listen();
