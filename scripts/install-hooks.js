const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..")
const srcDir = path.join(root, "githooks")
const destDir = path.join(root, ".git", "hooks")

if (!fs.existsSync(destDir)) {
  console.error(".git/hooks not found")
  process.exit(1)
}

for (const file of fs.readdirSync(srcDir)) {
  const src = path.join(srcDir, file)
  const dest = path.join(destDir, file)
  fs.copyFileSync(src, dest)
  try { fs.chmodSync(dest, 0o755) } catch {}
  console.log(`Installed hook: ${file}`)
}
