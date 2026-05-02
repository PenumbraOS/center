import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const distInstallDir = path.join(repoRoot, "dist-install");
const distCenterDir = path.join(repoRoot, "dist-center");
const distHugoDir = path.join(repoRoot, "dist-hugo");

async function run(command, args) {
  await execFileAsync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

async function main() {
  await rm(distInstallDir, { recursive: true, force: true });
  await rm(distCenterDir, { recursive: true, force: true });
  await rm(distHugoDir, { recursive: true, force: true });

  await run("npx", ["vite", "build", "--config", "vite.install.config.ts"]);
  await run("npx", ["vite", "build", "--config", "vite.center.config.ts"]);

  await mkdir(path.join(distHugoDir, "install"), { recursive: true });
  await mkdir(path.join(distHugoDir, "center"), { recursive: true });
  await cp(
    path.join(distInstallDir, "install.html"),
    path.join(distHugoDir, "install", "index.html"),
    {
      force: true,
    },
  );
  await cp(
    path.join(distInstallDir, "assets"),
    path.join(distHugoDir, "install", "assets"),
    {
      recursive: true,
    },
  );
  await cp(
    path.join(distInstallDir, "icons.svg"),
    path.join(distHugoDir, "install", "icons.svg"),
    {
      force: true,
    },
  );
  await cp(
    path.join(distInstallDir, "install"),
    path.join(distHugoDir, "install"),
    {
      recursive: true,
      force: true,
    },
  );
  await cp(
    path.join(distCenterDir, "center.html"),
    path.join(distHugoDir, "center", "index.html"),
    {
      force: true,
    },
  );
  await cp(
    path.join(distCenterDir, "assets"),
    path.join(distHugoDir, "center", "assets"),
    {
      recursive: true,
    },
  );
  await cp(
    path.join(distCenterDir, "icons.svg"),
    path.join(distHugoDir, "center", "icons.svg"),
    {
      force: true,
    },
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
