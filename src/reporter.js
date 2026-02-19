/**
 * reporter.js - JSON export builder and table renderer
 */

export function buildExportJSON(transactions, suspiciousAccounts, fraudRings) {
    const now = new Date();
    const generated_at = now.toISOString().slice(0, 19) + 'Z';

    return {
        generated_at,
        total_transactions_analyzed: transactions.length,
        suspicious_accounts: suspiciousAccounts, // already sorted descending by score
        fraud_rings: fraudRings
    };
}

export function downloadJSON(data, filename = 'rift_forensics_report.json') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function renderSummaryTable(fraudRings, suspiciousAccounts, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (fraudRings.length === 0 && suspiciousAccounts.length === 0) {
        container.innerHTML = `<p class="no-results">No suspicious activity detected.</p>`;
        return;
    }

    // Top suspicious accounts table
    const topAccounts = suspiciousAccounts.slice(0, 20);
    const accountRows = topAccounts.map(acc => {
        const scoreClass = acc.suspicion_score >= 70 ? 'score-high'
            : acc.suspicion_score >= 40 ? 'score-med' : 'score-low';
        const flagBadges = acc.flags.map(f =>
            `<span class="badge badge-${f.replace('_', '-')}">${f.replace('_', ' ')}</span>`
        ).join('');
        return `
      <tr>
        <td class="account-id">${escapeHTML(acc.account_id)}</td>
        <td><span class="score-pill ${scoreClass}">${acc.suspicion_score}</span></td>
        <td>${flagBadges}</td>
        <td>${acc.transactions_flagged}</td>
        <td>${acc.involved_in_rings.length > 0 ? acc.involved_in_rings.join(', ') : '—'}</td>
      </tr>`;
    }).join('');

    // Fraud rings table
    const ringRows = fraudRings.slice(0, 30).map(ring => {
        const typeLabel = ring.type === 'circular_routing' ? '🔄 Circular Routing' : '🔗 Shell Chain';
        return `
      <tr>
        <td class="ring-id">${escapeHTML(ring.ring_id)}</td>
        <td>${typeLabel}</td>
        <td>${ring.members.length}</td>
        <td>$${ring.total_amount.toLocaleString()}</td>
        <td>${ring.transaction_count}</td>
        <td class="members-cell" title="${escapeHTML(ring.members.join(' → '))}">
          ${ring.members.slice(0, 3).map(escapeHTML).join(' → ')}${ring.members.length > 3 ? ` …+${ring.members.length - 3}` : ''}
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `
    <div class="results-grid">
      <section class="table-section">
        <h3 class="section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Suspicious Accounts
          <span class="count-badge">${suspiciousAccounts.length}</span>
        </h3>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Account ID</th>
                <th>Score</th>
                <th>Flags</th>
                <th>Txns Flagged</th>
                <th>Rings</th>
              </tr>
            </thead>
            <tbody>${accountRows || '<tr><td colspan="5" class="empty-row">No suspicious accounts</td></tr>'}</tbody>
          </table>
        </div>
      </section>

      <section class="table-section">
        <h3 class="section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
          </svg>
          Fraud Rings Detected
          <span class="count-badge">${fraudRings.length}</span>
        </h3>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ring ID</th>
                <th>Type</th>
                <th>Members</th>
                <th>Total Amount</th>
                <th>Transactions</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>${ringRows || '<tr><td colspan="6" class="empty-row">No rings detected</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    </div>`;
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
