import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const isWindows = os.platform() === 'win32';
const binName = isWindows ? 'transkribator.exe' : 'transkribator';
const appPath = path.join(projectRoot, 'src-tauri', 'target', 'debug', binName);

let tauriDriver;
let exit = false;

function closeTauriDriver() {
    exit = true;
    if (tauriDriver) {
        tauriDriver.kill();
        tauriDriver = null;
    }
}

function onShutdown(fn) {
    const cleanup = () => {
        try {
            fn();
        } finally {
            process.exit();
        }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGHUP', cleanup);
    if (os.platform() === 'win32') process.on('SIGBREAK', cleanup);
}
onShutdown(closeTauriDriver);

export const config = {
    host: '127.0.0.1',
    port: 4444,
    specs: ['./specs/**/*.e2e.js'],
    maxInstances: 1,
    capabilities: [
        {
            maxInstances: 1,
            'tauri:options': {
                application: appPath,
            },
        },
    ],
    reporters: ['spec'],
    framework: 'mocha',
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000,
    },
    onPrepare: () => {
        spawnSync(
            'npm',
            ['run', 'tauri', 'build', '--', '--debug', '--no-bundle'],
            {
                cwd: projectRoot,
                stdio: 'inherit',
                shell: true,
            }
        );
    },
    beforeSession: () => {
        const driverPath = path.join(os.homedir(), '.cargo', 'bin', isWindows ? 'tauri-driver.exe' : 'tauri-driver');
        tauriDriver = spawn(driverPath, [], {
            stdio: [null, process.stdout, process.stderr],
        });
        tauriDriver.on('error', (error) => {
            console.error('tauri-driver error:', error);
            process.exit(1);
        });
        tauriDriver.on('exit', (code) => {
            if (!exit) {
                console.error('tauri-driver exited with code:', code);
                process.exit(1);
            }
        });
    },
    afterSession: () => {
        closeTauriDriver();
    },
};
