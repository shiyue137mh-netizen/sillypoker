/**
 * AI Card Table Extension - Difficulty Selection View
 * @description Renders the UI for selecting a new game's difficulty.
 */

export const DifficultyView = {
    init(deps) {
        // This view currently has no dependencies but the init function is kept for consistency.
    },
    render(container) {
        container.html(`
            <div class="difficulty-selection-container">
                <h2 class="difficulty-title">新的挑战</h2>
                <p class="difficulty-subtitle">选择你的挑战难度，这将决定你的初始资源。</p>
                <div class="difficulty-options-grid">
                    <button class="difficulty-option-btn" data-difficulty="baby">
                        <h4>宝宝模式</h4>
                        <div class="difficulty-option-details">
                            <span><i class="fas fa-heart"></i> 5 生命</span>
                            <span><i class="fas fa-coins"></i> 2000 筹码</span>
                        </div>
                    </button>
                    <button class="difficulty-option-btn" data-difficulty="easy">
                        <h4>简单</h4>
                        <div class="difficulty-option-details">
                            <span><i class="fas fa-heart"></i> 4 生命</span>
                            <span><i class="fas fa-coins"></i> 1500 筹码</span>
                        </div>
                    </button>
                    <button class="difficulty-option-btn" data-difficulty="normal">
                        <h4>普通</h4>
                        <div class="difficulty-option-details">
                            <span><i class="fas fa-heart"></i> 3 生命</span>
                            <span><i class="fas fa-coins"></i> 1000 筹码</span>
                        </div>
                    </button>
                    <button class="difficulty-option-btn" data-difficulty="hard">
                        <h4>困难</h4>
                        <div class="difficulty-option-details">
                            <span><i class="fas fa-heart"></i> 2 生命</span>
                            <span><i class="fas fa-coins"></i> 500 筹码</span>
                        </div>
                    </button>
                    <button class="difficulty-option-btn" data-difficulty="hell">
                        <h4>地狱</h4>
                        <div class="difficulty-option-details">
                            <span><i class="fas fa-heart"></i> 1 生命</span>
                            <span><i class="fas fa-coins"></i> 100 筹码</span>
                        </div>
                    </button>
                </div>
            </div>
        `);
    }
};
