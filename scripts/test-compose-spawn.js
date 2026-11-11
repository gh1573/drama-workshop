// compose-service 调用链路验证：execFile python 脚本是否正常返回
const { execFile } = require("node:child_process");
const t0 = Date.now();
execFile(
  "python3",
  ["scripts/assemble-episode.py", "cmwatz8k800wqpzia68d9lgbt", "--allow-missing"],
  { timeout: 240000, maxBuffer: 16 * 1024 * 1024 },
  (err, stdout, stderr) => {
    console.log("elapsed:", Math.round((Date.now() - t0) / 1000) + "s");
    if (err) {
      console.log("ERR:", err.message.slice(0, 300));
      console.log("STDERR tail:", stderr.slice(-200));
      process.exit(1);
    }
    const lines = stdout.trim().split("\n");
    console.log("last line:", lines[lines.length - 1]);
    process.exit(0);
  }
);
