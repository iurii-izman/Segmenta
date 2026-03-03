/**
 * App version — single source of truth from package.json.
 * Bump version in package.json (and optionally in src-tauri/tauri.conf.json for bundle).
 */
import packageJson from '../package.json';

export const APP_VERSION = (packageJson as { version: string }).version;
