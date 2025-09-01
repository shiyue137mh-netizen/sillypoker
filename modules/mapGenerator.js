/**
 * AI Card Table Extension - Map Generation Logic v2.0
 * @description Generates a fully connected, Slay the Spire-style map.
 */
import { shuffle } from './utils.js';

const NODE_TYPES = { 
    ENEMY: 'enemy', 
    ELITE: 'elite', 
    REST: 'rest', 
    SHOP: 'shop', 
    BOSS: 'boss', 
    EVENT: 'event',
    TREASURE: 'treasure',
    CARD_SHARP: 'card-sharp' // FIX: Renamed from UPGRADE for consistency with UI
};

/**
 * Determines the type of a node based on its row and randomness.
 * Increased the probability of 'event' nodes and decreased 'card-sharp' nodes.
 * @param {number} row - The current row of the node.
 * @param {number} totalRows - The total number of rows in the map.
 * @returns {string} The type of the node.
 */
function getNodeType(row, totalRows) {
    const random = Math.random();
    // 55% chance for a combat node
    if (random < 0.55) {
        // NEW: Elite chance now scales linearly with map progression.
        // The chance for a combat node to be an Elite increases from 0% on the first row to ~35% on the last row.
        const maxEliteChance = 0.35;
        const eliteChance = maxEliteChance * (row / totalRows);

        if (Math.random() < eliteChance) {
            return NODE_TYPES.ELITE;
        }
        return NODE_TYPES.ENEMY;
    } 
    // 45% chance for a non-combat/event node
    else {
        const eventRandom = Math.random();
        // NEW BALANCING: Increased event chance significantly
        if (eventRandom < 0.45) return NODE_TYPES.EVENT;      // ~20.25% total chance (was 13.5%)
        if (eventRandom < 0.65) return NODE_TYPES.REST;       // ~9% total chance
        if (eventRandom < 0.80) return NODE_TYPES.SHOP;       // ~6.75% total chance
        if (eventRandom < 0.95) return NODE_TYPES.TREASURE;   // ~6.75% total chance
        return NODE_TYPES.CARD_SHARP;                         // ~2.25% total chance (was ~4.5%)
    }
}

/**
 * Analyzes all paths from start to boss and ensures each path has at least one elite enemy.
 * @param {Array<object>} nodes - The array of all map nodes.
 * @param {Array<object>} paths - The array of all map paths.
 */
function ensureElitesOnAllPaths(nodes, paths) {
    const adj = new Map();
    const nodesById = new Map(nodes.map(n => [n.id, n]));
    nodes.forEach(n => adj.set(n.id, []));
    paths.forEach(p => adj.get(p.from)?.push(p.to));

    const startNodes = nodes.filter(n => n.row === 0);
    const bossNode = nodes.find(n => n.type === NODE_TYPES.BOSS);
    if (!bossNode) return;

    const pathsToUpgrade = [];

    const dfs = (nodeId, currentPath, hasElite) => {
        const node = nodesById.get(nodeId);
        if (!node) return;

        const newPath = [...currentPath, nodeId];
        const newHasElite = hasElite || node.type === NODE_TYPES.ELITE;

        if (nodeId === bossNode.id) {
            if (!newHasElite) {
                pathsToUpgrade.push(newPath);
            }
            return;
        }
        
        const connections = adj.get(nodeId) || [];
        connections.forEach(nextNodeId => dfs(nextNodeId, newPath, newHasElite));
    };

    startNodes.forEach(startNode => dfs(startNode.id, [], false));
    
    if (pathsToUpgrade.length > 0) {
        // Use a Set to avoid upgrading the same node multiple times
        const upgradedNodes = new Set();
        pathsToUpgrade.forEach(path => {
            const potentialNodesToUpgrade = path
                .map(id => nodesById.get(id))
                .filter(node => node && node.type === NODE_TYPES.ENEMY && !upgradedNodes.has(node.id));

            if (potentialNodesToUpgrade.length > 0) {
                // Pick a random enemy from the path to upgrade
                const nodeToUpgrade = potentialNodesToUpgrade[Math.floor(Math.random() * potentialNodesToUpgrade.length)];
                nodeToUpgrade.type = NODE_TYPES.ELITE;
                upgradedNodes.add(nodeToUpgrade.id);
            }
        });
    }
}


/**
 * Generates the data structure for a procedural map, ensuring full connectivity.
 * @param {number} layer - The current map layer index (e.g., 0 for the first floor).
 * @param {number} rowsPerLayer - The number of rows of nodes before the boss.
 * @param {number} paths - The maximum number of parallel paths.
 * @returns {{nodes: Array<object>, paths: Array<object>, player_position: string|null, path_taken: Array<string>, mapLayer: number, bossDefeated: boolean, secret_nodes: Array<object>, searched_nodes: Array<string>}} The generated map data.
 */
export function generateMapData(layer = 0, rowsPerLayer = 8, paths = 5) {
    const map = { nodes: [], paths: [] };
    const layerHeight = 800;
    const rowHeight = layerHeight / (rowsPerLayer + 2); // +2 for start and boss rows
    const mapWidth = 500; // MODIFIED: Reduced width
    const nodesByRow = Array.from({ length: rowsPerLayer }, () => []);

    // 1. Generate all regular nodes
    for (let i = 0; i < rowsPerLayer; i++) {
        const nodesInRow = Math.floor(Math.random() * (paths - 2)) + 3;
        for (let j = 0; j < nodesInRow; j++) {
            const properties = [];
            // Base 'big' property chance
            if (Math.random() < 0.05) {
                properties.push('big');
            }
            // List of other possible special properties
            const possibleProperties = ['Wealthy', 'Cursed', 'Blessed', 'Volatile', 'Ambush', 'Trap', 'Illusion'];
            // Give each property a ~4% chance, but only one special property per node (besides 'big').
            const specialPropRoll = Math.random();
            const propChance = 0.04;
            let addedSpecial = false;

            for (let k = 0; k < possibleProperties.length && !addedSpecial; k++) {
                if (specialPropRoll < propChance * (k + 1)) {
                    properties.push(possibleProperties[k]);
                    addedSpecial = true;
                }
            }
            
            const node = {
                id: `L${layer}-R${i}-N${j}`,
                row: i,
                x: (mapWidth / (nodesInRow + 1)) * (j + 1) + (Math.random() - 0.5) * 40,
                y: layerHeight - (i + 1.5) * rowHeight + (Math.random() - 0.5) * 30,
                type: getNodeType(i, rowsPerLayer),
                connections: [],
                properties: properties,
                incoming_connections: [] // Temporary helper
            };

            nodesByRow[i].push(node);
            map.nodes.push(node);
        }
    }

    // 2. Generate boss node
    const bossNode = {
        id: `L${layer}-BOSS`,
        row: rowsPerLayer,
        x: mapWidth / 2,
        y: rowHeight,
        type: NODE_TYPES.BOSS,
        connections: [],
        properties: [],
        incoming_connections: []
    };
    map.nodes.push(bossNode);
    const allRows = [...nodesByRow, [bossNode]];

    // 3. Connect nodes upwards, ensuring connectivity
    for (let i = 0; i < rowsPerLayer; i++) {
        const currentRow = allRows[i];
        const nextRow = allRows[i + 1];

        // Each node in the current row must connect to at least one in the next row
        currentRow.forEach(node => {
            const sortedNextNodes = [...nextRow].sort((a, b) => Math.abs(a.x - node.x) - Math.abs(b.x - node.x));
            const connectionsCount = Math.random() < 0.3 ? 2 : 1;
            for (let k = 0; k < Math.min(connectionsCount, sortedNextNodes.length); k++) {
                const targetNode = sortedNextNodes[k];
                if (!node.connections.includes(targetNode.id)) {
                    node.connections.push(targetNode.id);
                    targetNode.incoming_connections.push(node.id);
                    map.paths.push({ from: node.id, to: targetNode.id });
                }
            }
        });
        
        nextRow.forEach(nextNode => {
            if (nextNode.incoming_connections.length === 0) {
                 const sortedCurrentNodes = [...currentRow].sort((a, b) => Math.abs(a.x - nextNode.x) - Math.abs(b.x - nextNode.x));
                 const sourceNode = sortedCurrentNodes[0];
                 if(sourceNode) {
                    if (!sourceNode.connections.includes(nextNode.id)) {
                         sourceNode.connections.push(nextNode.id);
                         nextNode.incoming_connections.push(sourceNode.id);
                         map.paths.push({ from: sourceNode.id, to: nextNode.id });
                    }
                 }
            }
        });
    }

    // 4. Ensure all paths to boss have at least one elite
    ensureElitesOnAllPaths(map.nodes, map.paths);

    // 5. Cap the number of elites to a maximum of 6
    const MAX_ELITES = 6;
    const eliteNodes = map.nodes.filter(n => n.type === NODE_TYPES.ELITE);
    if (eliteNodes.length > MAX_ELITES) {
        const shuffledElites = shuffle(eliteNodes);
        for (let i = 0; i < shuffledElites.length - MAX_ELITES; i++) {
            shuffledElites[i].type = NODE_TYPES.ENEMY;
        }
    }

    // 6. Generate Secret Rooms (does not affect visual connections)
    // NEW: Secret nodes now have pre-calculated coordinates and a 'discovered' flag.
    const secret_nodes = [];
    map.nodes.forEach((node, index) => {
        let hasSecret = false;
        const secretType = Math.random() < 0.20 ? 'super_hidden' : 'hidden';

        if ((secretType === 'super_hidden' && node.connections.length >= 4) || (secretType === 'hidden' && Math.random() < 0.05)) {
            hasSecret = true;
        }
        
        if (hasSecret) {
            const angle = Math.random() * 2 * Math.PI;
            const distance = 60 + Math.random() * 20;
            secret_nodes.push({ 
                id: `L${layer}-S${index}`,
                attached_to_node_id: node.id, 
                type: secretType,
                discovered: false,
                x: node.x + Math.cos(angle) * distance,
                y: node.y + Math.sin(angle) * distance,
            });
        }
    });
    
    // Clean up temporary helper property
    map.nodes.forEach(node => delete node.incoming_connections);

    return {
        ...map,
        player_position: null,
        path_taken: [],
        mapLayer: layer,
        bossDefeated: false,
        secret_nodes: secret_nodes,
        searched_nodes: [], // Initialize for tracking secret room searches
    };
}