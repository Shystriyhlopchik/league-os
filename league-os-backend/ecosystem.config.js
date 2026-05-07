module.exports = {
    apps: [
        {
            name: 'league-os-backend',
            script: 'dist/main.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
        },
    ],
};