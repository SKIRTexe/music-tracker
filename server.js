// PM2 launcher for Next.js dev server on Windows
const { spawn } = require("child_process");
const path = require("path");

const next = spawn(
  process.execPath,
  [path.join(__dirname, "node_modules/next/dist/bin/next"), "dev"],
  { stdio: "inherit", cwd: __dirname }
);

next.on("close", (code) => process.exit(code ?? 0));
next.on("error", (err) => { console.error(err); process.exit(1); });
