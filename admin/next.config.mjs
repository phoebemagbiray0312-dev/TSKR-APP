/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // type errors are checked in the repo; don't block the deploy on them
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};
