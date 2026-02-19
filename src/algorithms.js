/**
 * algorithms.js
 * Core fraud detection algorithms:
 * 1. Cycle detection (DFS, length 3–5) → Circular fund routing
 * 2. Smurfing detection (fan-in/fan-out ≥10 within 72 hours)
 * 3. Shell chain detection (3+ hops, intermediaries with ≤3 total txns)
 * 4. Suspicion score aggregation (0–100)
 */

const CYCLE_MIN = 3;
const CYCLE_MAX = 5;
const SMURFING_THRESHOLD = 10;
const SMURF_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours in ms
const SHELL_MIN_HOPS = 3;
const SHELL_MAX_HOPS = 6;
const SHELL_TX_THRESHOLD = 3; // intermediary max total transactions

// Score weights
const SCORE_CYCLE = 35;
const SCORE_SMURF = 30;
const SCORE_SHELL = 25;

// ─────────────────────────────────────────────
// 1. CYCLE DETECTION (DFS)
// ─────────────────────────────────────────────

function normalizeCycle(members) {
    // Canonical form: rotate so smallest string is first
    let minIdx = 0;
    for (let i = 1; i < members.length; i++) {
        if (members[i] < members[minIdx]) minIdx = i;
    }
    return [...members.slice(minIdx), ...members.slice(0, minIdx)];
}

export function detectCycles(graph) {
    const { outgoing, nodes } = graph;
    const cycles = [];
    const cycleKeys = new Set();
    const nodeSet = [...nodes];

    function dfs(start, current, path, visited) {
        const neighbors = outgoing.get(current) || new Set();
        for (const neighbor of neighbors) {
            if (neighbor === start && path.length >= CYCLE_MIN && path.length <= CYCLE_MAX) {
                // Found a cycle
                const cycle = normalizeCycle([...path]);
                const key = cycle.join('→');
                if (!cycleKeys.has(key)) {
                    cycleKeys.add(key);
                    cycles.push([...path]);
                }
            } else if (!visited.has(neighbor) && path.length < CYCLE_MAX) {
                visited.add(neighbor);
                path.push(neighbor);
                dfs(start, neighbor, path, visited);
                path.pop();
                visited.delete(neighbor);
            }
        }
    }

    for (const node of nodeSet) {
        const visited = new Set([node]);
        dfs(node, node, [node], visited);
    }

    return cycles;
}

// ─────────────────────────────────────────────
// 2. SMURFING DETECTION
// ─────────────────────────────────────────────

export function detectSmurfing(graph, merchantThreshold) {
    const { nodes, nodeOutEdges, nodeInEdges, nodeAmounts, outgoing } = graph;
    const smurfs = new Set();
    const smurfDetails = new Map(); // node -> {fanIn, fanOut}

    for (const node of nodes) {
        // Merchant exclusion: nodes with avg tx >> 95th percentile AND no outgoing cycles
        const amounts = nodeAmounts.get(node) || [];
        const avgAmt = amounts.length > 0
            ? amounts.reduce((a, b) => a + b, 0) / amounts.length
            : 0;

        // A high-volume merchant: high avg amount AND primary sink (mostly receives, rarely sends)
        const outEdges = nodeOutEdges.get(node) || [];
        const inEdges = nodeInEdges.get(node) || [];
        const isMerchantLike = avgAmt > merchantThreshold
            && outEdges.length < inEdges.length * 0.1; // sends < 10% of what it receives
        if (isMerchantLike) continue;

        // Compute fan-in within 72h: count unique senders per 72h window
        let maxFanIn = 0;
        if (inEdges.length >= SMURFING_THRESHOLD) {
            const sortedIn = [...inEdges].sort((a, b) => a.ts - b.ts);
            let windowStart = 0;
            const uniqueSenders = new Set();
            for (let i = 0; i < sortedIn.length; i++) {
                uniqueSenders.add(sortedIn[i].from);
                while (sortedIn[i].ts - sortedIn[windowStart].ts > SMURF_WINDOW_MS) {
                    uniqueSenders.delete(sortedIn[windowStart].from);
                    windowStart++;
                }
                maxFanIn = Math.max(maxFanIn, uniqueSenders.size);
            }
        }

        // Compute fan-out within 72h: count unique receivers per 72h window
        let maxFanOut = 0;
        if (outEdges.length >= SMURFING_THRESHOLD) {
            const sortedOut = [...outEdges].sort((a, b) => a.ts - b.ts);
            let windowStart = 0;
            const uniqueReceivers = new Set();
            for (let i = 0; i < sortedOut.length; i++) {
                uniqueReceivers.add(sortedOut[i].to);
                while (sortedOut[i].ts - sortedOut[windowStart].ts > SMURF_WINDOW_MS) {
                    uniqueReceivers.delete(sortedOut[windowStart].to);
                    windowStart++;
                }
                maxFanOut = Math.max(maxFanOut, uniqueReceivers.size);
            }
        }

        if (maxFanIn >= SMURFING_THRESHOLD || maxFanOut >= SMURFING_THRESHOLD) {
            smurfs.add(node);
            smurfDetails.set(node, { fanIn: maxFanIn, fanOut: maxFanOut });
        }
    }

    return { smurfs, smurfDetails };
}

// ─────────────────────────────────────────────
// 3. SHELL CHAIN DETECTION
// ─────────────────────────────────────────────

export function detectShellChains(graph) {
    const { nodes, outgoing, nodeTxCount } = graph;
    const shellNodes = new Set();
    const shellChains = [];
    const chainKeys = new Set();

    // BFS/DFS path traversal: find paths where intermediate nodes have≤3 txns
    function dfsChain(start, current, path, depth) {
        if (depth >= SHELL_MIN_HOPS) {
            // Check if this forms a valid shell chain
            // At least one intermediate with low tx count
            const intermediates = path.slice(1, -1);
            const hasShellIntermediate = intermediates.some(n =>
                (nodeTxCount.get(n) || 0) <= SHELL_TX_THRESHOLD
            );
            if (hasShellIntermediate && path.length > 0) {
                const key = path.join('→');
                if (!chainKeys.has(key)) {
                    chainKeys.add(key);
                    shellChains.push([...path]);
                    // Mark all intermediate nodes as shell nodes
                    for (const n of intermediates) {
                        if ((nodeTxCount.get(n) || 0) <= SHELL_TX_THRESHOLD) {
                            shellNodes.add(n);
                        }
                    }
                }
            }
        }

        if (depth < SHELL_MAX_HOPS) {
            const neighbors = outgoing.get(current) || new Set();
            for (const neighbor of neighbors) {
                if (!path.includes(neighbor)) {
                    path.push(neighbor);
                    dfsChain(start, neighbor, path, depth + 1);
                    path.pop();
                }
            }
        }
    }

    for (const node of nodes) {
        // Only start from nodes that have outgoing edges and reasonable tx count
        const txCount = nodeTxCount.get(node) || 0;
        if (txCount > 0 && (outgoing.get(node) || new Set()).size > 0) {
            dfsChain(node, node, [node], 0);
        }
    }

    return { shellNodes, shellChains };
}

// ─────────────────────────────────────────────
// 4. SUSPICION SCORE + AGGREGATION
// ─────────────────────────────────────────────

export function computeScores(graph, cycles, smurfResult, shellResult) {
    const { nodes, nodeTxCount } = graph;
    const { smurfs, smurfDetails } = smurfResult;
    const { shellNodes } = shellResult;

    // Build node → cycle membership map
    const nodeCycles = new Map();
    cycles.forEach((cycle, idx) => {
        for (const node of cycle) {
            if (!nodeCycles.has(node)) nodeCycles.set(node, []);
            nodeCycles.get(node).push(idx);
        }
    });

    const accounts = new Map(); // accountId -> suspicion data

    const ensureAccount = (id) => {
        if (!accounts.has(id)) {
            accounts.set(id, {
                account_id: id,
                suspicion_score: 0,
                raw_score: 0,
                flags: new Set(),
                involved_in_rings: new Set(),
                transactions_flagged: 0
            });
        }
        return accounts.get(id);
    };

    // From cycles
    for (const [node, cycleIndices] of nodeCycles) {
        const acc = ensureAccount(node);
        acc.flags.add('cycle');
        acc.raw_score += SCORE_CYCLE * cycleIndices.length;
        acc.transactions_flagged += cycleIndices.length;
        for (const idx of cycleIndices) {
            acc.involved_in_rings.add(`ring_${String(idx + 1).padStart(2, '0')}`);
        }
    }

    // From smurfing
    for (const node of smurfs) {
        const acc = ensureAccount(node);
        acc.flags.add('smurfing');
        const details = smurfDetails.get(node);
        if (details.fanIn >= SMURFING_THRESHOLD) acc.raw_score += SCORE_SMURF;
        if (details.fanOut >= SMURFING_THRESHOLD) acc.raw_score += SCORE_SMURF;
        acc.transactions_flagged += (details.fanIn || 0) + (details.fanOut || 0);
    }

    // From shell chains
    for (const node of shellNodes) {
        const acc = ensureAccount(node);
        acc.flags.add('shell_chain');
        acc.raw_score += SCORE_SHELL;
        acc.transactions_flagged += nodeTxCount.get(node) || 0;
    }

    // Normalize scores and finalize
    const result = [];
    for (const [, acc] of accounts) {
        acc.suspicion_score = Math.min(100, Math.round(acc.raw_score));
        if (acc.suspicion_score > 0) {
            result.push({
                account_id: acc.account_id,
                suspicion_score: acc.suspicion_score,
                flags: [...acc.flags],
                involved_in_rings: [...acc.involved_in_rings],
                transactions_flagged: acc.transactions_flagged
            });
        }
    }

    // Sort descending by suspicion_score
    result.sort((a, b) => b.suspicion_score - a.suspicion_score);
    return result;
}

// ─────────────────────────────────────────────
// 5. FRAUD RING BUILDER
// ─────────────────────────────────────────────

export function buildFraudRings(cycles, shellResult, transactions) {
    const rings = [];
    const txLookup = new Map(); // "sender→receiver" -> [tx amounts]
    for (const tx of transactions) {
        const key = `${tx.sender_id}→${tx.receiver_id}`;
        if (!txLookup.has(key)) txLookup.set(key, []);
        txLookup.get(key).push(tx.amount);
    }

    // Cycle-based rings
    cycles.forEach((cycle, idx) => {
        const ringId = `ring_${String(idx + 1).padStart(2, '0')}`;
        let totalAmount = 0;
        let txCount = 0;
        for (let i = 0; i < cycle.length; i++) {
            const key = `${cycle[i]}→${cycle[(i + 1) % cycle.length]}`;
            const amounts = txLookup.get(key) || [];
            totalAmount += amounts.reduce((a, b) => a + b, 0);
            txCount += amounts.length;
        }
        rings.push({
            ring_id: ringId,
            type: 'circular_routing',
            members: cycle,
            transaction_count: txCount,
            total_amount: Math.round(totalAmount * 100) / 100
        });
    });

    // Shell chain rings
    const { shellChains } = shellResult;
    shellChains.slice(0, 20).forEach((chain, idx) => {
        const ringId = `shell_${String(idx + 1).padStart(2, '0')}`;
        let totalAmount = 0;
        let txCount = 0;
        for (let i = 0; i < chain.length - 1; i++) {
            const key = `${chain[i]}→${chain[i + 1]}`;
            const amounts = txLookup.get(key) || [];
            totalAmount += amounts.reduce((a, b) => a + b, 0);
            txCount += amounts.length;
        }
        if (txCount > 0) {
            rings.push({
                ring_id: ringId,
                type: 'shell_chain',
                members: chain,
                transaction_count: txCount,
                total_amount: Math.round(totalAmount * 100) / 100
            });
        }
    });

    return rings;
}

// ─────────────────────────────────────────────
// 6. MAIN ANALYSIS ENTRY POINT
// ─────────────────────────────────────────────

export function runAnalysis(graph, transactions, merchantThreshold) {
    const cycles = detectCycles(graph);
    const smurfResult = detectSmurfing(graph, merchantThreshold);
    const shellResult = detectShellChains(graph);
    const suspiciousAccounts = computeScores(graph, cycles, smurfResult, shellResult);
    const fraudRings = buildFraudRings(cycles, shellResult, transactions);

    return {
        cycles,
        smurfResult,
        shellResult,
        suspiciousAccounts,
        fraudRings
    };
}
