#!/usr/bin/env node
import { program } from "commander";
import { publish } from "../index.mjs";

program
  .command("publish [options]")
  .description(
    "publishes the contents of .\\build\\stage\\{version} to the current version's GitHub release"
  )
  .option("-r, --release", "publish immediately, do not create draft")
  .action(function (_cmd, { release }) {
    const opts = {};
    opts.draft = !release;
    try {
      publish(opts);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });

program
  .command("help", "", { isDefault: true, noHelp: true })
  .action(function () {
    console.log();
    console.log("Usage: node-pre-gyp-github publish");
    console.log();
    console.log(
      "publishes the contents of ./build/stage/{version} to the current version's GitHub release"
    );
  });

program.parse(process.argv);

if (!program.args.length) {
  program.help();
}
