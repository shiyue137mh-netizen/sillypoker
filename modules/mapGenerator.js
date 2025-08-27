/**
 * AI Card Table Extension - Map Generation Logic v2.0
 * @description Generates a fully connected, Slay the Spire-style map.
 */

const NODE_TYPES = { 
    ENEMY: 'enemy', 
    ELITE: 'elite', 
    REST: 'rest', 
    SHOP: 'shop', 
    BOSS: 'boss', 
    EVENT: 'event',
    TREASURE: 'treasure',
    UPGRADE: 'upgrade'
};

function getNodeType(row, totalRows) {
    const random = Math.random();
    // 55% chance for a combat node
    if (random < 0.55) {
        // In later rows (after 40% of the map), there's a 30% chance for an enemy to be an elite instead.
        if (row > totalRows * 0.4 && Math.random() < 0.3) {
            return NODE_TYPES.ELITE;
        }
        return NODE_TYPES.ENEMY;
    } 
    // 45% chance for a non-combat/event node
    else {
        const eventRandom = Math.random();
        if (eventRandom < 0.30) return NODE_TYPES.EVENT;      // ~13.5% total chance
        if (eventRandom < 0.55) return NODE_TYPES.REST;       // ~11.25% total chance
        if (eventRandom < 0.75) return NODE_TYPES.SHOP;       // ~9% total chance
        if (eventRandom < 0.90) return NODE_TYPES.TREASURE;   // ~6.75% total chance
        return NODE_TYPES.UPGRADE;                            // ~4.5% total chance
    }
}

/**
 * Generates the data structure for a procedural map, ensuring full connectivity.
 * @param {number} layer - The current map layer index (e.g., 0 for the first floor).
 * @param {number} rowsPerLayer - The number of rows of nodes before the boss.
 * @param {number} paths - The maximum number of parallel paths.
 * @returns {{nodes: Array<object>, paths: Array<object>, player_position: string|null, path_taken: Array<string>, mapLayer: number, bossDefeated: boolean}} The generated map data.
 */
export function generateMapData(layer = 0, rowsPerLayer = 8, paths = 5) {
    const map = { nodes: [], paths: [] };
    const layerHeight = 800;
    const rowHeight = layerHeight / (rowsPerLayer + 2); // +2 for start and boss rows
    const mapWidth = 600;
    const nodesByRow = Array.from({ length: rowsPerLayer }, () => []);

    // 1. Generate all regular nodes
    for (let i = 0; i < rowsPerLayer; i++) {
        const nodesInRow = Math.floor(Math.random() * (paths - 2)) + 3;
        for (let j = 0; j < nodesInRow; j++) {
            const node = {
                id: `L${layer}-R${i}-N${j}`,
                row: i,
                x: (mapWidth / (nodesInRow + 1)) * (j + 1) + (Math.random() - 0.5) * 40,
                y: layerHeight - (i + 1.5) * rowHeight + (Math.random() - 0.5) * 30,
                type: getNodeType(i, rowsPerLayer),
                connections: [],
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
            // Find 1 or 2 closest nodes in the next row
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
        
        // Ensure every node in the next row has at least one incoming connection
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
    
    // Clean up temporary helper property
    map.nodes.forEach(node => delete node.incoming_connections);

    return {
        ...map,
        player_position: null,
        path_taken: [],
        mapLayer: layer,
        bossDefeated: false,
    };
}