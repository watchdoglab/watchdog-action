// Posts the engine's JSON findings as one PR review with inline comments.
// Findings on lines outside the diff go into the review body instead.
const fs = require('fs');

const { GITHUB_TOKEN, REPO, PR_NUMBER, FINDINGS_FILE, FINDINGS_TEXT, MIN_SEVERITY } = process.env;
const rank = { critical: 4, high: 3, medium: 2, low: 1 };
const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' };

function parse(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object in engine output');
  return JSON.parse(text.slice(start, end + 1));
}

// Map of path -> Set of new-file line numbers that appear in the diff.
function diffLines(diff) {
  const lines = new Map();
  let file = null;
  let n = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) {
      file = l === '+++ /dev/null' ? null : l.slice(4).replace(/^b\//, '');
      if (file && !lines.has(file)) lines.set(file, new Set());
    } else if (l.startsWith('@@')) {
      n = Number(/\+(\d+)/.exec(l)[1]);
    } else if (file && (l.startsWith('+') || l.startsWith(' '))) {
      lines.get(file).add(n++);
    }
  }
  return lines;
}

async function gh(path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
}

function comment(f) {
  let text = `**${icon[f.severity] || ''} [${f.severity}] ${f.title}**\n\n${f.body}`;
  if (f.suggestion) text += `\n\n\`\`\`suggestion\n${f.suggestion}\n\`\`\``;
  return text;
}

(async () => {
  const raw = FINDINGS_FILE && fs.existsSync(FINDINGS_FILE) ? fs.readFileSync(FINDINGS_FILE, 'utf8') : FINDINGS_TEXT || '';
  const report = parse(raw);
  const min = rank[MIN_SEVERITY] || 2;
  const findings = (report.findings || []).filter((f) => (rank[f.severity] || 0) >= min);
  const inDiff = diffLines(fs.readFileSync(`${process.env.GITHUB_WORKSPACE}/.watchdog/pr.diff`, 'utf8'));

  const inline = [];
  const outside = [];
  for (const f of findings) {
    if (inDiff.get(f.path)?.has(f.line)) inline.push({ path: f.path, line: f.line, side: 'RIGHT', body: comment(f) });
    else outside.push(f);
  }

  const counts = Object.keys(rank)
    .map((s) => [s, findings.filter((f) => f.severity === s).length])
    .filter(([, c]) => c)
    .map(([s, c]) => `${icon[s]} ${c} ${s}`)
    .join(' · ');
  let body = `## 🐕 Watchdog security review\n\n${findings.length ? counts : '✅ No security findings in this PR.'}\n\n${report.summary || ''}`;
  for (const f of outside) body += `\n\n---\n\`${f.path}:${f.line}\`\n${comment(f)}`;
  if (report.not_checked) body += `\n\n**Not checked:** ${report.not_checked}`;

  await gh(`/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, { event: 'COMMENT', body, comments: inline });
  console.log(`Posted ${inline.length} inline and ${outside.length} summary findings.`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
