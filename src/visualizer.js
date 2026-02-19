/**
 * visualizer.js - Cytoscape.js graph renderer
 * Highlights suspicious nodes/edges in fraud rings
 */

let cy = null;

export function initVisualizer(containerId) {
    const container = document.getElementById(containerId);
    if (!container || typeof cytoscape === 'undefined') return null;

    cy = cytoscape({
        container,
        style: getCytoscapeStyle(),
        layout: { name: 'preset' },
        minZoom: 0.1,
        maxZoom: 4,
        wheelSensitivity: 0.3
    });

    return cy;
}

export function renderGraph(transactions, suspiciousAccounts, fraudRings, maxNodes = 300) {
    if (!cy) return;

    cy.elements().remove();

    // Build score lookup
    const scoreMap = new Map();
    for (const acc of suspiciousAccounts) {
        scoreMap.set(acc.account_id, acc.suspicion_score);
    }

    // Build ring membership lookup (for edge highlighting)
    const ringEdges = new Set();
    for (const ring of fraudRings) {
        for (let i = 0; i < ring.members.length; i++) {
            const a = ring.members[i];
            const b = ring.members[(i + 1) % ring.members.length];
            ringEdges.add(`${a}→${b}`);
        }
        // For shell chains, not circular
        if (ring.type === 'shell_chain') {
            for (let i = 0; i < ring.members.length - 1; i++) {
                ringEdges.add(`${ring.members[i]}→${ring.members[i + 1]}`);
            }
        }
    }

    // Sample transactions for display (for large datasets)
    let displayTxs = transactions;
    if (transactions.length > maxNodes * 3) {
        // Prioritize transactions involving suspicious accounts
        const suspIds = new Set(suspiciousAccounts.map(a => a.account_id));
        const suspicious = transactions.filter(t => suspIds.has(t.sender_id) || suspIds.has(t.receiver_id));
        const normal = transactions.filter(t => !suspIds.has(t.sender_id) && !suspIds.has(t.receiver_id));
        const normalSample = normal.slice(0, Math.max(0, maxNodes * 3 - suspicious.length));
        displayTxs = [...suspicious, ...normalSample];
    }

    // Collect unique nodes from displayTxs
    const nodeIds = new Set();
    for (const tx of displayTxs) {
        nodeIds.add(tx.sender_id);
        nodeIds.add(tx.receiver_id);
    }

    const elements = [];

    // Nodes
    for (const id of nodeIds) {
        const score = scoreMap.get(id) || 0;
        const category = score >= 70 ? 'critical' : score >= 40 ? 'warning' : 'normal';
        elements.push({
            data: { id, label: id, score, category },
            classes: category
        });
    }

    // Edges (deduplicate by sender→receiver for display, sum amounts)
    const edgeMap = new Map();
    for (const tx of displayTxs) {
        const key = `${tx.sender_id}→${tx.receiver_id}`;
        if (!edgeMap.has(key)) {
            edgeMap.set(key, { count: 0, total: 0 });
        }
        edgeMap.get(key).count++;
        edgeMap.get(key).total += tx.amount;
    }

    let edgeIdx = 0;
    for (const [key, val] of edgeMap) {
        const [source, target] = key.split('→');
        const isRingEdge = ringEdges.has(key);
        elements.push({
            data: {
                id: `e_${edgeIdx++}`,
                source,
                target,
                label: `$${(val.total / val.count).toFixed(0)}`,
                count: val.count,
                ring: isRingEdge
            },
            classes: isRingEdge ? 'ring-edge' : 'normal-edge'
        });
    }

    cy.add(elements);

    // Use cose layout for good force-directed positioning
    cy.layout({
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 40,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: 450000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
    }).run();

    // Tooltip on hover
    cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        const data = node.data();
        showTooltip(evt.renderedPosition, `
      <strong>${data.id}</strong><br>
      Score: <span style="color:${data.score >= 70 ? '#ff4d6d' : data.score >= 40 ? '#ffd166' : '#06d6a0'}">${data.score}</span>
    `);
    });

    cy.on('mouseout', 'node', () => hideTooltip());

    cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        document.dispatchEvent(new CustomEvent('node-selected', { detail: node.data() }));
    });
}

function showTooltip(pos, html) {
    let tip = document.getElementById('cy-tooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'cy-tooltip';
        tip.className = 'cy-tooltip';
        document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.style.display = 'block';
    tip.style.left = (pos.x + document.getElementById('graph-container').getBoundingClientRect().left + 10) + 'px';
    tip.style.top = (pos.y + document.getElementById('graph-container').getBoundingClientRect().top + 10) + 'px';
}

function hideTooltip() {
    const tip = document.getElementById('cy-tooltip');
    if (tip) tip.style.display = 'none';
}

function getCytoscapeStyle() {
    return [
        {
            selector: 'node',
            style: {
                'background-color': '#3a3f5c',
                'border-color': '#4a5080',
                'border-width': 2,
                'label': 'data(label)',
                'color': '#c5cae9',
                'font-size': '10px',
                'font-family': 'Inter, sans-serif',
                'text-valign': 'center',
                'text-halign': 'center',
                'width': 38,
                'height': 38,
                'text-wrap': 'ellipsis',
                'text-max-width': '70px',
                'text-overflow-wrap': 'anywhere',
                'min-zoomed-font-size': 8
            }
        },
        {
            selector: 'node.critical',
            style: {
                'background-color': '#ff2d5510',
                'border-color': '#ff2d55',
                'border-width': 3,
                'color': '#ff6b8a',
                'width': 52,
                'height': 52,
                'font-weight': 'bold',
                'background-gradient-stop-colors': '#ff2d55 #8b0000',
                'background-fill': 'radial-gradient'
            }
        },
        {
            selector: 'node.warning',
            style: {
                'background-color': '#ffd16610',
                'border-color': '#ffd166',
                'border-width': 2.5,
                'color': '#ffd166',
                'width': 44,
                'height': 44
            }
        },
        {
            selector: 'node.normal',
            style: {
                'background-color': '#1e2140',
                'border-color': '#3a3f5c'
            }
        },
        {
            selector: 'edge',
            style: {
                'width': 1.5,
                'line-color': '#2a2f50',
                'target-arrow-color': '#2a2f50',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'opacity': 0.6,
                'arrow-scale': 0.8
            }
        },
        {
            selector: 'edge.ring-edge',
            style: {
                'line-color': '#ff6b6b',
                'target-arrow-color': '#ff6b6b',
                'width': 2.5,
                'opacity': 0.9,
                'line-style': 'solid'
            }
        },
        {
            selector: 'node:selected',
            style: {
                'border-color': '#b388ff',
                'border-width': 4,
                'background-color': '#4a2080'
            }
        }
    ];
}

export function resetVisualizer() {
    if (cy) {
        cy.elements().remove();
    }
}
