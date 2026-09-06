import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Committed lineup snapshots are read from disk at request time, not
  // imported, so file tracing has to be told they belong in every server
  // bundle.
  outputFileTracingIncludes: {
    '/*': ['./data/lineups/**/*.json'],
  },
};

export default nextConfig;
