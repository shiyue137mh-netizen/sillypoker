/**
 * AI Card Table Extension - Settings View
 * @description Renders the UI for the settings tab.
 */
import { AIGame_State } from '../state.js';
import { AudioManager } from '../audioManager.js';

export const SettingsView = {
    init(deps) {
        // This view currently has no dependencies but the init function is kept for consistency.
    },
    render(container) {
        const runInProgress = AIGame_State.runInProgress;
        const isMuted = AIGame_State.isMuted;
        const audioButtonClass = isMuted ? '' : 'active';
        const audioButtonText = isMuted ? '关闭' : '开启';

        const bgmTracks = AudioManager.getBgmTracks();
        const currentTrack = bgmTracks[AIGame_State.currentBgmTrackIndex];
        const trackName = AIGame_State.isBgmPlaying ? (currentTrack?.name || '未知曲目') : '已暂停';
        const playPauseIcon = AIGame_State.isBgmPlaying ? 'fa-pause' : 'fa-play';

        container.html(`
            <div class="settings-view-container">
                <h2 class="settings-title">设置</h2>
                <div class="settings-options-list">
                    <div class="settings-option">
                        <div class="settings-option-text">
                            <h4>游戏音效</h4>
                            <p>开启或关闭点击、发牌等UI音效。</p>
                        </div>
                        <div class="settings-option-action">
                            <button class="sillypoker-btn-toggle ${audioButtonClass}" id="toggle-audio-btn">${audioButtonText}</button>
                        </div>
                    </div>

                    <div class="settings-option">
                        <div class="settings-option-text">
                            <h4>背景音乐</h4>
                            <p>控制游戏过程中的背景音乐。</p>
                        </div>
                        <div class="bgm-player">
                            <div class="bgm-track-info" title="${trackName}">${trackName}</div>
                            <div class="bgm-controls">
                                <button id="bgm-prev-btn" class="sillypoker-header-btn" title="上一曲"><i class="fas fa-step-backward"></i></button>
                                <button id="bgm-toggle-btn" class="sillypoker-header-btn" title="播放/暂停"><i class="fas ${playPauseIcon}"></i></button>
                                <button id="bgm-next-btn" class="sillypoker-header-btn" title="下一曲"><i class="fas fa-step-forward"></i></button>
                            </div>
                            <div class="bgm-volume-control">
                                <i class="fas fa-volume-down"></i>
                                <input type="range" id="bgm-volume-slider" class="bgm-volume-slider" min="0" max="1" step="0.01" value="${AIGame_State.bgmVolume}">
                                <i class="fas fa-volume-up"></i>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-option">
                        <div class="settings-option-text">
                            <h4>面板字号</h4>
                            <p>调整整个插件界面的基础字体大小。</p>
                        </div>
                        <div class="settings-option-action font-size-control">
                            <input type="range" id="font-size-slider" min="14" max="28" step="1" value="${AIGame_State.baseFontSize}">
                            <span id="font-size-value">${AIGame_State.baseFontSize}px</span>
                        </div>
                    </div>

                    <div class="settings-option">
                        <div class="settings-option-text">
                            <h4>重置UI位置</h4>
                            <p>如果面板移出屏幕，点击此按钮将其恢复至屏幕中央。</p>
                        </div>
                        <div class="settings-option-action">
                            <button class="sillypoker-btn-secondary reset-ui-position-btn">重置位置</button>
                        </div>
                    </div>

                    <div class="settings-option">
                        <div class="settings-option-text">
                            <h4>重新开始挑战</h4>
                            <p>这将立即结束你当前的挑战，并让你返回难度选择界面。所有进度都将丢失。</p>
                        </div>
                        <div class="settings-option-action">
                            <button class="sillypoker-btn-danger restart-challenge-btn" ${!runInProgress ? 'disabled' : ''}>重新开始</button>
                        </div>
                    </div>
                </div>
            </div>
        `);
    }
};
