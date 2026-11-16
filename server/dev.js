import { spawn } from "node:child_process";
const processes = [
  spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "--watch", "server/index.js"],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", ...process.argv.slice(2)],
    { stdio: "inherit" },
  ),
];
let ending = false;
function stop(code = 0) {
  if (ending) return;
  ending = true;
  for (const p of processes) p.kill("SIGTERM");
  process.exitCode = code;
}
for (const p of processes) {
  p.on("error", (e) => {
    console.error(e);
    stop(1);
  });
  p.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
