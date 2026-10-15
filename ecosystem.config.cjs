module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || "politedb-backend",
      script: "dist/server.js",
      cwd: process.env.APP_DIR || ".",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      // Matches SHUTDOWN_TIMEOUT_MS in src/server.ts so in-flight requests can finish.
      kill_timeout: 10000,
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
      },
    },
  ],
};
