#!/usr/bin/env node
/**
 * Secret scanner for the ecologits-cline-integration repository.
 *
 * Usage:
 *   node scripts/scan-secrets.js --staged
 *   node scripts/scan-secrets.js --range <from-sha> <to-sha>
 *
 * Exits with code 1 when a potential secret is detected.
 */
const { execSync } = require("child_process")

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

const PATTERNS = [
  { name: "AWS access key", re: /AKIA(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16}/g },
  { name: "GitHub token", re: /ghp_[A-Za-z0-9]{36}/g },
  { name: "GitHub fine-grained PAT", re: /github_pat_[A-Za-z0-9_]{82}/g },
  { name: "Slack token", re: /xox[baprs]-[0-9]{8,}-[0-9]{8,}-[A-Za-z0-9]{20,}/g },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "Stripe live key", re: /sk_live_[0-9a-zA-Z]{24}/g },
  { name: "Stripe restricted key", re: /rk_live_[0-9a-zA-Z]{24}/g },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
]

function getDiff(args) {
  const cmd = `git diff ${args} --no-ext-diff -U0`
  return execSync(cmd, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
}

function main() {
  const argv = process.argv.slice(2)
  let diffText = ""

  if (argv.includes("--staged")) {
    diffText = getDiff("--cached")
  } else if (argv[0] === "--range") {
    const from = argv[1] || EMPTY_TREE
    const to = argv[2]
    if (!to) {
      console.error("Missing <to-sha> for --range")
      process.exit(2)
    }
    const base = from === "0000000000000000000000000000000000000000" ? EMPTY_TREE : from
    diffText = getDiff(`${base}..${to}`)
  } else {
    console.error("Usage: scan-secrets.js --staged | --range <from> <to>")
    process.exit(2)
  }

  const ALLOWLIST = [
    "EXAMPLE",
    "example",
    "process.env",
    "import.meta.env",
    "your_",
    "YOUR_",
    "changeme",
    "xxx",
    "TODO",
    "SECRET",
    "xoxb-team-token",
  ]

  const findings = []
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(diffText)) !== null) {
      const matched = m[0]
      if (ALLOWLIST.some((a) => matched.includes(a))) continue
      findings.push({ name, match: matched.slice(0, 80) })
      if (findings.length > 50) break
    }
    if (findings.length > 50) break
  }

  if (findings.length > 0) {
    console.error("Potential secret detected by scan-secrets.js:")
    for (const f of findings) {
      console.error(`  - ${f.name}: ${f.match}`)
    }
    console.error("Push/commit blocked. Remove the secret and retry.")
    process.exit(1)
  }
  console.log("scan-secrets: no secrets detected")
}

try {
  main()
} catch (err) {
  console.error("scan-secrets error:", err && err.message ? err.message : err)
  process.exit(1)
}
