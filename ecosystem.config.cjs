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
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
      },
    },
  ],
};
