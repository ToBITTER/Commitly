const baseUrl = (process.argv[2] || process.env.RENTSPLIT_BASE_URL || "").replace(/\/+$/, "");

if (!/^https?:\/\//.test(baseUrl)) {
  console.error("Usage: npm run check:deployment -- https://your-app.onrender.com");
  process.exit(1);
}

const checks = [
  { path: "/health", type: "application/json", includes: '"status":"ok"' },
  { path: "/", type: "text/html", includes: "RentSplit" },
  { path: "/app.js", type: "text/javascript", includes: "renderDashboard" },
  { path: "/session", type: "application/json", includes: '"authenticationRequired":true' },
];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`);
  const body = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) throw new Error(`${check.path} returned HTTP ${response.status}.`);
  if (!contentType.includes(check.type)) throw new Error(`${check.path} returned ${contentType || "no content type"}.`);
  if (!body.includes(check.includes)) throw new Error(`${check.path} returned an unexpected response.`);
  console.log(`✓ ${check.path}`);
}

console.log(`RentSplit deployment is healthy: ${baseUrl}`);
