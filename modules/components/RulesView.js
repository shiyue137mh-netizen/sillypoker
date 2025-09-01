/**
 * AI Card Table Extension - Rules View UI Component
 * @description Generates the HTML for the game rules tab.
 */

const a_common_rules = [
    { id: 'texas_holdem', name: '德州扑克' },
    { id: 'blackjack', name: '21点' },
    { id: 'dou_di_zhu', name: '斗地主' }
];

const b_party_games = [
    { id: 'guess_the_size', name: '猜大小' },
    { id: 'kings_game', name: '国王游戏' }
];

const c_special_rules = [
    { id: 'custom_rules_placeholder', name: '自定义游戏规则' },
    { id: 'dice_commands', name: '命运之骰' }
];

function generateRuleList(rules) {
    return rules.map(rule => `
        <li class="rules-list-item" data-rule-id="${rule.id}">${rule.name}</li>
    `).join('');
}

export function getRulesViewHTML() {
    return `
        <div class="rules-view-container">
            <div class="rules-list-panel">
                <ul class="rules-list">
                    <li class="rules-list-header">经典扑克</li>
                    ${generateRuleList(a_common_rules)}
                    <li class="rules-list-header">派对游戏</li>
                    ${generateRuleList(b_party_games)}
                    <li class="rules-list-header">特殊规则</li>
                    ${generateRuleList(c_special_rules)}
                </ul>
            </div>
            <div class="rules-content-panel">
                <div class="rules-content-display">
                    <p>请从左侧选择一个游戏规则以查看其详细说明。</p>
                </div>
            </div>
        </div>
    `;
}