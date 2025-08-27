/**
 * AI Card Table Extension - Utility Functions
 * @description Provides common, reusable functions like deck creation and shuffling.
 */

const DEFAULT_SUITS = ["♥", "♦", "♣", "♠"];
const DEFAULT_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/**
 * Creates a customizable deck of cards based on options.
 * @param {object} options - Configuration for the deck.
 * @param {Array<string>} [options.use_suits=DEFAULT_SUITS] - The suits to include.
 * @param {Array<string>} [options.use_ranks=DEFAULT_RANKS] - The ranks to include.
 * @param {number} [options.jokers=0] - The number of jokers to add.
 * @param {number} [options.num_decks=1] - The number of decks to combine.
 * @returns {Array<object>} An array of card objects.
 */
export function createDeck(options = {}) {
    const {
        use_suits = DEFAULT_SUITS,
        use_ranks = DEFAULT_RANKS,
        jokers = 0,
        num_decks = 1
    } = options;
    
    let singleDeck = [];
    for (const suit of use_suits) {
        for (const rank of use_ranks) {
            singleDeck.push({ 
                suit, 
                rank,
                is_special: false,
                name: `${suit}${rank}`
            });
        }
    }

    let finalDeck = [];
    for (let i = 0; i < num_decks; i++) {
        finalDeck.push(...JSON.parse(JSON.stringify(singleDeck)));
    }
    
    for (let i = 0; i < jokers; i++) {
        finalDeck.push({
            suit: '🃏',
            rank: i === 0 ? 'Big Joker' : 'Little Joker',
            is_special: true,
            name: i === 0 ? '大王' : '小王'
        });
    }

    return finalDeck;
}

/**
 * Shuffles an array in place using the Fisher-Yates (aka Knuth) shuffle algorithm.
 * @param {Array} array The array to shuffle.
 * @returns {Array} The shuffled array.
 */
export function shuffle(array) {
    let currentIndex = array.length, randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex !== 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
}