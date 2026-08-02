const { execFileSync, execSync } = require("child_process");
const path = require("path");
const cwd = "D:\\Projects\\opencodex";
console.log("cwd", cwd);
const token = execSync("gh auth token", { encoding: "utf8", cwd, shell: true }).trim();
if (!token) {
  console.error("no token");
  process.exit(1);
}
console.log("token len", token.length);
const url = `https://x-access-token:${token}@github.com/vitou-vitou/opencodex.git`;
try {
  const out = execFileSync(
    "git",
    ["push", url, "HEAD:vitou/feat/claude-provider-failover"],
    { cwd, encoding: "utf8" },
  );
  console.log(out.replaceAll(token, "***"));
} catch (e) {
  const msg = `${e.stdout || ""}\n${e.stderr || e.message || e}`.replaceAll(token, "***");
  console.error(msg);
  process.exit(e.status || 1);
}
