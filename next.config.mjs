/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Dynamic fs.readFileSync(path.join(...)) calls in the API routes
  // aren't always picked up by Next's automatic file tracing — force
  // these static data files into every serverless function's bundle so
  // they're present at runtime on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**", "./config/**"],
  },
};

export default nextConfig;
