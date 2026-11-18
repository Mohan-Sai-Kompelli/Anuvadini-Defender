module.exports = {
  apps: [
    {
      name: 'saacms-server',
      cwd: './server',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1000M',
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
      },
    },
    {
      name: 'anuvadini-defender',
      cwd: './defender',
      script: './venv/bin/uvicorn',
      args: 'anuvadini_detector.server:app --host 127.0.0.1 --port 8055',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1000M',
      env: {
        PYTHONPATH: '.',
        MONGO_URI: process.env.MONGO_URI,
      },
    },
    {
      name: 'face-recognition',
      cwd: './face-back',
      script: 'check.py',
      interpreter: '/home/isldev/saacms/defender/venv/bin/python',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',
      env: {
        FACE_API_PORT: 50011,
        FACE_API_THREADS: 8,
      },
    },
  ],
};
