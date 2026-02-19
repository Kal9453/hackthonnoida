/**
 * main.js - App orchestrator
 * Wires together: upload → parse → analyze → visualize → report
 */

import { parseCSV } from './parser.js';
import { buildGraph, computeMerchantThreshold } from './graph.js';
import { runAnalysis } from './algorithms.js';
import { initVisualizer, renderGraph, resetVisualizer } from './visualizer.js';
import { buildExportJSON, downloadJSON, renderSummaryTable } from './reporter.js';

let analysisResult = null;
let allTransactions = null;

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
    setupDropzone();
    setupEventListeners();
    initVisualizer('graph-container');
});

// ── Dropzone Setup ──
function setupDropzone() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });
}

function setupEventListeners() {
    document.getElementById('btn-download').addEventListener('click', () => {
        if (!analysisResult) return;
        const json = buildExportJSON(allTransactions, analysisResult.suspiciousAccounts, analysisResult.fraudRings);
        downloadJSON(json);
    });

    document.getElementById('btn-demo').addEventListener('click', () => {
        fetch('/sample.csv')
            .then(r => r.text())
            .then(text => {
                const blob = new Blob([text], { type: 'text/csv' });
                const file = new File([blob], 'sample.csv', { type: 'text/csv' });
                handleFile(file);
            })
            .catch(() => showError('Could not load sample CSV.'));
    });

    document.getElementById('btn-reset').addEventListener('click', resetApp);

    document.getElementById('graph-filter').addEventListener('change', (e) => {
        if (!analysisResult) return;
        const filter = e.target.value;
        filterGraph(filter);
    });

    // Node selection event
    document.addEventListener('node-selected', (e) => {
        showNodeDetail(e.detail);
    });
}

// ── File Handling ──
async function handleFile(file) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        showError('Please upload a CSV file.');
        return;
    }

    resetApp(false);
    showProcessing(true);
    updateStatus('Reading CSV file...', 5);

    const startTime = Date.now();

    try {
        const text = await readFileAsText(file);
        updateStatus('Parsing transactions...', 15);

        const transactions = await parseCSV(text);
        updateStatus(`Parsed ${transactions.length.toLocaleString()} transactions. Building graph...`, 30);

        // Small delay to allow UI to update
        await nextTick();

        const graph = buildGraph(transactions);
        updateStatus('Running cycle detection (DFS)...', 45);

        await nextTick();
        const merchantThreshold = computeMerchantThreshold(graph.nodeAmounts);

        updateStatus('Detecting smurfing patterns...', 60);
        await nextTick();

        updateStatus('Scanning shell chains...', 72);
        await nextTick();

        const result = runAnalysis(graph, transactions, merchantThreshold);
        allTransactions = transactions;
        analysisResult = result;

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        updateStatus(`Analysis complete in ${elapsed}s. Rendering graph...`, 85);

        await nextTick();

        // Render graph
        renderGraph(transactions, result.suspiciousAccounts, result.fraudRings);

        updateStatus('Generating report...', 95);
        await nextTick();

        // Render table
        renderSummaryTable(result.fraudRings, result.suspiciousAccounts, 'results-container');

        // Update stats bar
        updateStatsBar(transactions, result, elapsed);

        showProcessing(false);
        showResults(true);

        // Enable download
        document.getElementById('btn-download').disabled = false;
        document.getElementById('graph-filter').disabled = false;

        updateStatus('Done', 100);

    } catch (err) {
        showProcessing(false);
        showError(err.message);
        console.error(err);
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function nextTick() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

// ── Graph Filter ──
function filterGraph(filter) {
    if (!analysisResult || !allTransactions) return;

    const { suspiciousAccounts, fraudRings } = analysisResult;

    let filteredTxs = allTransactions;
    if (filter === 'suspicious') {
        const suspIds = new Set(suspiciousAccounts.map(a => a.account_id));
        filteredTxs = allTransactions.filter(t => suspIds.has(t.sender_id) || suspIds.has(t.receiver_id));
    } else if (filter === 'rings') {
        const ringMembers = new Set(fraudRings.flatMap(r => r.members));
        filteredTxs = allTransactions.filter(t => ringMembers.has(t.sender_id) || ringMembers.has(t.receiver_id));
    }

    renderGraph(filteredTxs, suspiciousAccounts, fraudRings);
}

// ── Node Detail Panel ──
function showNodeDetail(data) {
    const panel = document.getElementById('node-detail');
    if (!panel) return;

    panel.innerHTML = `
    <div class="node-detail-inner">
      <h4>Account: ${data.id}</h4>
      <p>Suspicion Score: <strong style="color:${data.score >= 70 ? '#ff4d6d' : data.score >= 40 ? '#ffd166' : '#06d6a0'}">${data.score}</strong>/100</p>
      <p>Category: <em>${data.category}</em></p>
    </div>`;
    panel.style.display = 'block';
}

// ── Stats Bar ──
function updateStatsBar(transactions, result, elapsed) {
    const { suspiciousAccounts, fraudRings, cycles, smurfResult } = result;
    document.getElementById('stat-txns').textContent = transactions.length.toLocaleString();
    document.getElementById('stat-suspicious').textContent = suspiciousAccounts.length;
    document.getElementById('stat-rings').textContent = fraudRings.length;
    document.getElementById('stat-cycles').textContent = cycles.length;
    document.getElementById('stat-smurfs').textContent = smurfResult.smurfs.size;
    document.getElementById('stat-time').textContent = `${elapsed}s`;
}

// ── UI State Helpers ──
function showProcessing(show) {
    document.getElementById('processing-section').style.display = show ? 'block' : 'none';
    document.getElementById('upload-section').style.display = show ? 'none' : 'block';
}

function showResults(show) {
    document.getElementById('results-section').style.display = show ? 'block' : 'none';
    document.getElementById('graph-section').style.display = show ? 'block' : 'none';
    document.getElementById('stats-bar').style.display = show ? 'flex' : 'none';
}

function showError(msg) {
    const el = document.getElementById('error-banner');
    el.textContent = `⚠️ ${msg}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function updateStatus(msg, pct) {
    document.getElementById('status-text').textContent = msg;
    document.getElementById('progress-bar-fill').style.width = `${pct}%`;
}

function resetApp(showUpload = true) {
    analysisResult = null;
    allTransactions = null;
    resetVisualizer();
    renderSummaryTable([], [], 'results-container');
    showResults(false);
    showProcessing(false);
    if (showUpload) {
        document.getElementById('upload-section').style.display = 'block';
    }
    document.getElementById('btn-download').disabled = true;
    document.getElementById('graph-filter').disabled = true;
    document.getElementById('error-banner').style.display = 'none';
    document.getElementById('file-input').value = '';

    const panel = document.getElementById('node-detail');
    if (panel) panel.style.display = 'none';
}
