/**
 * AI Card Table Extension - Mode Selection View
 * @description Renders the UI for selecting the game mode (Roguelike vs Origin).
 */

export const ModeSelectionView = {
    init(deps) {
        // No dependencies needed for this simple view
    },
    render(container) {
        container.html(`
            <div class="difficulty-selection-container">
                <h2 class="difficulty-title">选择游戏模式</h2>
                <p class="difficulty-subtitle">你想要一场步步为营的 Roguelike 冒险，还是一个纯粹的牌桌模拟？</p>
                <div class="difficulty-options-grid" style="grid-template-columns: repeat(2, 1fr); max-width: 450px;">
                    <button class="difficulty-option-btn" data-mode="roguelike">
                        <h4>Roguelike 冒险</h4>
                        <div class="difficulty-option-details">
                            <span><i class="fas fa-dungeon"></i> 挑战楼层</span>
                            <span><i class="fas fa-heart"></i> 管理生命</span>
                            <span><i class="fas fa-gem"></i> 收集道具</span>
                        </div>
                    </button>
                    <button class="difficulty-option-btn" data-mode="origin">
                        <h4>Origin 纯粹模拟</h4>
                        <div class="difficulty-option-details">
                             <span><i class="fas fa-table-tennis-paddle-ball"></i> 纯粹牌桌</span>
                             <span><i class="fas fa-infinity"></i> 无限对局</span>
                             <span><i class="fas fa-tools"></i> 测试指令</span>
                        </div>
                    </button>
                </div>
            </div>
        `);
    }
};
