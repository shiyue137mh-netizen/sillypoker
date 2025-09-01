/**
 * AI Card Table Extension - Update Checker
 * @description Fetches the latest manifest from GitHub to check for new versions.
 */
import { AIGame_State } from './state.js';
import { Logger } from './logger.js';

const GITHUB_MANIFEST_URL = 'https://raw.githubusercontent.com/shiyue137mh-netizen/sillypoker/main/sillypoker/manifest.json';
const LOCAL_MANIFEST_PATH = './manifest.json'; // Relative path to this extension's manifest

/**
 * Compares two semantic version strings (e.g., "1.2.3").
 * @param {string} v1 - The first version string.
 * @param {string} v2 - The second version string.
 * @returns {boolean} True if v2 is newer than v1, otherwise false.
 */
function isNewerVersion(v1, v2) {
    if (typeof v1 !== 'string' || typeof v2 !== 'string') return false;
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p2 > p1) return true;
        if (p1 > p2) return false;
    }
    return false;
}

export const UpdateChecker = {
    async check() {
        try {
            // Fetch local version first
            const localResponse = await fetch(LOCAL_MANIFEST_PATH);
            if (!localResponse.ok) throw new Error(`Local manifest fetch failed: ${localResponse.status}`);
            const localManifest = await localResponse.json();
            const localVersion = localManifest.version;
            AIGame_State.extensionVersion = localVersion;

            // Then fetch remote version
            const remoteResponse = await fetch(GITHUB_MANIFEST_URL);
            if (!remoteResponse.ok) throw new Error(`GitHub fetch failed: ${remoteResponse.status}`);
            const remoteManifest = await remoteResponse.json();
            const remoteVersion = remoteManifest.version;

            Logger.log(`Version check: Local=${localVersion}, Remote=${remoteVersion}`);

            if (isNewerVersion(localVersion, remoteVersion)) {
                AIGame_State.isUpdateAvailable = true;
                AIGame_State.latestVersionInfo = {
                    version: remoteVersion,
                    description: remoteManifest.description || '无可用描述。'
                };
                Logger.success('发现新版本!', AIGame_State.latestVersionInfo);
            } else {
                AIGame_State.isUpdateAvailable = false;
                AIGame_State.latestVersionInfo = null;
            }
        } catch (error) {
            Logger.error('版本更新检查失败:', error);
            AIGame_State.isUpdateAvailable = false;
            AIGame_State.latestVersionInfo = null;
        }
    }
};
