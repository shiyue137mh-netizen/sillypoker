/**
 * AI Card Table Extension - Talent Tree Data
 * @description Defines the static structure, costs, and dependencies of the 15-node talent tree.
 */

export const talentTreeData = {
    // Level 1 (Root)
    'root_1': {
        id: 'root_1',
        name: '???',
        description: '???',
        cost: 1,
        dependencies: [],
        type: 'Core',
        position: { x: '50%', y: '10%' }
    },

    // Level 2 (Branches from Root)
    'branch_2a': {
        id: 'branch_2a',
        name: '???',
        description: '???',
        cost: 2,
        dependencies: ['root_1'],
        type: 'Core',
        position: { x: '35%', y: '25%' }
    },
    'branch_2b': {
        id: 'branch_2b',
        name: '???',
        description: '???',
        cost: 2,
        dependencies: ['root_1'],
        type: 'Core',
        position: { x: '65%', y: '25%' }
    },

    // Level 3 (Leaf nodes of the binary tree, start of specialized paths)
    'leaf_3a_economy': {
        id: 'leaf_3a_economy',
        name: '???',
        description: '???',
        cost: 3,
        dependencies: ['branch_2a'],
        type: 'Economy',
        position: { x: '20%', y: '40%' }
    },
    'leaf_3b_luck': {
        id: 'leaf_3b_luck',
        name: '???',
        description: '???',
        cost: 3,
        dependencies: ['branch_2a'],
        type: 'Luck',
        position: { x: '40%', y: '40%' }
    },
    'leaf_3c_combat': {
        id: 'leaf_3c_combat',
        name: '???',
        description: '???',
        cost: 3,
        dependencies: ['branch_2b'],
        type: 'Combat',
        position: { x: '60%', y: '40%' }
    },
    'leaf_3d_special': {
        id: 'leaf_3d_special',
        name: '???',
        description: '???',
        cost: 3,
        dependencies: ['branch_2b'],
        type: 'Special',
        position: { x: '80%', y: '40%' }
    },

    // Vertical Paths - Economy
    'econ_path_1': {
        id: 'econ_path_1',
        name: '???',
        description: '???',
        cost: 5,
        dependencies: ['leaf_3a_economy'],
        type: 'Economy',
        position: { x: '20%', y: '60%' }
    },
    'econ_path_2': {
        id: 'econ_path_2',
        name: '???',
        description: '???',
        cost: 8,
        dependencies: ['econ_path_1'],
        type: 'Economy',
        position: { x: '20%', y: '80%' }
    },

    // Vertical Paths - Luck
    'luck_path_1': {
        id: 'luck_path_1',
        name: '???',
        description: '???',
        cost: 5,
        dependencies: ['leaf_3b_luck'],
        type: 'Luck',
        position: { x: '40%', y: '60%' }
    },
    'luck_path_2': {
        id: 'luck_path_2',
        name: '???',
        description: '???',
        cost: 8,
        dependencies: ['luck_path_1'],
        type: 'Luck',
        position: { x: '40%', y: '80%' }
    },

    // Vertical Paths - Combat
    'combat_path_1': {
        id: 'combat_path_1',
        name: '???',
        description: '???',
        cost: 5,
        dependencies: ['leaf_3c_combat'],
        type: 'Combat',
        position: { x: '60%', y: '60%' }
    },
    'combat_path_2': {
        id: 'combat_path_2',
        name: '???',
        description: '???',
        cost: 8,
        dependencies: ['combat_path_1'],
        type: 'Combat',
        position: { x: '60%', y: '80%' }
    },
    
    // Vertical Paths - Special
    'special_path_1': {
        id: 'special_path_1',
        name: '???',
        description: '???',
        cost: 5,
        dependencies: ['leaf_3d_special'],
        type: 'Special',
        position: { x: '80%', y: '60%' }
    },
    'special_path_2': {
        id: 'special_path_2',
        name: '???',
        description: '???',
        cost: 8,
        dependencies: ['special_path_1'],
        type: 'Special',
        position: { x: '80%', y: '80%' }
    },
};
