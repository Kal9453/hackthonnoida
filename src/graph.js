/**
 * graph.js - Build directed graph data structures from transaction list
 */

export function buildGraph(transactions) {
    // adjacency: nodeId -> Set of neighbor nodeIds (outgoing)
    const outgoing = new Map(); // sender -> Set<receiver>
    const incoming = new Map(); // receiver -> Set<sender>
    const nodes = new Set();

    // Per-node transaction lists (for time-window analysis)
    const nodeOutEdges = new Map(); // sender -> [{receiver, amount, ts}]
    const nodeInEdges = new Map();  // receiver -> [{sender, amount, ts}]

    // Total transaction count per node
    const nodeTxCount = new Map();

    // All amounts per node (for merchant heuristic)
    const nodeAmounts = new Map();

    for (const tx of transactions) {
        const { sender_id: s, receiver_id: r, amount, timestamp } = tx;

        nodes.add(s);
        nodes.add(r);

        // outgoing adjacency
        if (!outgoing.has(s)) outgoing.set(s, new Set());
        outgoing.get(s).add(r);

        // incoming adjacency
        if (!incoming.has(r)) incoming.set(r, new Set());
        incoming.get(r).add(s);

        // edge lists with timestamps
        if (!nodeOutEdges.has(s)) nodeOutEdges.set(s, []);
        nodeOutEdges.get(s).push({ to: r, amount, ts: timestamp });

        if (!nodeInEdges.has(r)) nodeInEdges.set(r, []);
        nodeInEdges.get(r).push({ from: s, amount, ts: timestamp });

        // tx count
        nodeTxCount.set(s, (nodeTxCount.get(s) || 0) + 1);
        nodeTxCount.set(r, (nodeTxCount.get(r) || 0) + 1);

        // amounts
        if (!nodeAmounts.has(s)) nodeAmounts.set(s, []);
        nodeAmounts.get(s).push(amount);
        if (!nodeAmounts.has(r)) nodeAmounts.set(r, []);
        nodeAmounts.get(r).push(amount);
    }

    return {
        nodes,
        outgoing,
        incoming,
        nodeOutEdges,
        nodeInEdges,
        nodeTxCount,
        nodeAmounts,
        totalTransactions: transactions.length
    };
}

/** 
 * Compute 95th percentile average transaction amount across all nodes 
 * Used for merchant exclusion heuristic
 */
export function computeMerchantThreshold(nodeAmounts) {
    const avgAmounts = [];
    for (const [, amounts] of nodeAmounts) {
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        avgAmounts.push(avg);
    }
    avgAmounts.sort((a, b) => a - b);
    const idx = Math.floor(avgAmounts.length * 0.95);
    return avgAmounts[idx] || Infinity;
}
