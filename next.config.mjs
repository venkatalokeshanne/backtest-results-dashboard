/** @type {import('next').NextConfig} */

// Dynamic fs.readFileSync(path.join(...)) calls in the API routes aren't always picked up by Next's
// automatic file tracing, so the data files each route reads are forced into its serverless bundle.
// Each route gets only its own files: the Pine screening files (~130 MB) go to /api/pine alone, so the
// other functions stay small and well under Vercel's 250 MB per-function limit.
const TRENDSPIDER_DATA = [
  "./data/exports/results.json",
  "./data/exports/*robustness.json",
  "./data/exports/daytrading_playbook.json",
  "./config/**",
];
const OTHER_ROUTES = ["/api/compare-timeframes", "/api/filters", "/api/leaderboard", "/api/playbook",
  "/api/results", "/api/robustness", "/api/tag-strategies", "/api/top-strategies"];

const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    ...Object.fromEntries(OTHER_ROUTES.map((r) => [r, TRENDSPIDER_DATA])),
    "/api/pine": ["./data/exports/pine_*.json"],
  },
  // keep each route to its own data, whatever the automatic tracer guesses from the dynamic paths
  outputFileTracingExcludes: {
    ...Object.fromEntries(OTHER_ROUTES.map((r) => [r, ["./data/exports/pine_*"]])),
    "/api/pine": ["./data/exports/results.json", "./data/exports/*robustness.json",
      "./data/exports/daytrading_playbook.json"],
  },
};

export default nextConfig;
