function loadDashboard() {
  chrome.storage.local.get(['posts'], (result) => {
    const posts = result.posts || [];
    const container = document.getElementById('content');

    let html = `
      <div class="toggle-row">
        <span class="toggle-label">Scanner</span>
        <div class="toggle-controls">
          <span class="toggle-status" id="scannerStatus">--</span>
          <button class="toggle-btn" id="toggleBtn">--</button>
        </div>
      </div>
    `;

    if (posts.length === 0) {
      html += `
        <div class="empty-state">
          <p>No posts captured yet.</p>
          <p style="margin-top:8px; font-size:11px;">
            Make sure the scanner is <strong>ACTIVE</strong> above,<br>
            then visit LinkedIn or X to begin detection.
          </p>
        </div>
      `;
      container.innerHTML = html;
      initToggle();
      return;
    }

    // Split by platform
    const twitter = posts.filter(p => p.platform === 'twitter');
    const linkedin = posts.filter(p => p.platform === 'linkedin');

    // Calculate stats per platform
    function getStats(platformPosts) {
      const total = platformPosts.length;
      if (total === 0) return null;

      const scored = platformPosts.filter(p => (p.finalScore ?? p.aiScore) !== undefined);
      const ai = scored.filter(p => (p.finalScore ?? p.aiScore) >= 0.6);
      const uncertain = scored.filter(p => (p.finalScore ?? p.aiScore) >= 0.35 && (p.finalScore ?? p.aiScore) < 0.6);
      const human = scored.filter(p => (p.finalScore ?? p.aiScore) < 0.35);
      
      const avgScore = scored.length > 0
        ? scored.reduce((sum, p) => sum + (p.finalScore ?? p.aiScore), 0) / scored.length
        : 0;
      
      const avgWords = Math.round(
        platformPosts.reduce((sum, p) => sum + (p.wordCount || 0), 0) / total
      );
      const aiPercent = scored.length > 0
        ? Math.round((ai.length / scored.length) * 100)
        : 0;
      const suspectPercent = scored.length > 0
        ? Math.round(((ai.length + uncertain.length) / scored.length) * 100)
        : 0;

      return {
        total, ai: ai.length, uncertain: uncertain.length,
        human: human.length, avgScore, avgWords,
        aiPercent, suspectPercent
      };
    }

    const twitterStats = getStats(twitter);
    const linkedinStats = getStats(linkedin);

    // Overall stats
    const allScored = posts.filter(p => (p.finalScore ?? p.aiScore) !== undefined);
    const totalAI = allScored.filter(p => (p.finalScore ?? p.aiScore) >= 0.6).length;
    const totalUncertain = allScored.filter(p => (p.finalScore ?? p.aiScore) >= 0.35 && (p.finalScore ?? p.aiScore) < 0.6).length;
    const totalHuman = allScored.filter(p => (p.finalScore ?? p.aiScore) < 0.35).length;

    // Build platform comparison HTML
    function platformCard(name, emoji, stats, color) {
      if (!stats) {
        return `
          <div class="platform-card">
            <div class="platform-header" style="color: ${color};">${emoji} ${name}</div>
            <div class="platform-empty">No data yet</div>
          </div>
        `;
      }

      let meterColor = '#4caf50';
      if (stats.suspectPercent > 40) meterColor = '#f44336';
      else if (stats.suspectPercent > 15) meterColor = '#ff9800';

      return `
        <div class="platform-card">
          <div class="platform-header" style="color: ${color};">${name}</div>
          <div class="platform-stat-row">
            <span>Posts collected</span>
            <strong>${stats.total}</strong>
          </div>
          <div class="platform-stat-row">
            <span>Avg AI score</span>
            <strong>${stats.avgScore.toFixed(2)}</strong>
          </div>
          <div class="platform-stat-row">
            <span>Avg words/post</span>
            <strong>${stats.avgWords}</strong>
          </div>
          <div class="meter-bar" style="margin: 8px 0;">
            <div class="meter-fill" style="width: ${stats.suspectPercent}%; background: ${meterColor};"></div>
          </div>
          <div class="platform-breakdown">
            <span class="tag tag-ai">AI: ${stats.ai}</span>
            <span class="tag tag-uncertain">UNCERTAIN: ${stats.uncertain}</span>
            <span class="tag tag-human">HUMAN: ${stats.human}</span>
          </div>
        </div>
      `;
    }

    const topAI = [...allScored]
      .sort((a, b) => (b.finalScore ?? b.aiScore) - (a.finalScore ?? a.aiScore))
      .slice(0, 5);

    html += `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${posts.length}</div>
          <div class="stat-label">Total Posts</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalAI + totalUncertain}</div>
          <div class="stat-label">AI / Suspect</div>
        </div>
      </div>

      <div class="section-title">Platform Comparison</div>
      <div class="platform-grid">
        ${platformCard('Twitter / X', '', twitterStats, '#1da1f2')}
        ${platformCard('LinkedIn', '', linkedinStats, '#0a66c2')}
      </div>

      ${linkedinStats && twitterStats ? `
        <div class="finding">
          <strong>STATISTICAL INSIGHT:</strong>
          LinkedIn shows ${linkedinStats.suspectPercent}% AI/suspect content vs 
          ${twitterStats.suspectPercent}% on Twitter
        </div>
      ` : ''}

      <div class="section-title">All Posts Classification</div>
      <div class="breakdown">
        <div class="breakdown-row">
          <span class="breakdown-label">Likely AI (>=0.6)</span>
          <span class="breakdown-count count-ai">${totalAI}</span>
        </div>
        <div class="breakdown-row">
          <span class="breakdown-label">Uncertain (0.35-0.6)</span>
          <span class="breakdown-count count-uncertain">${totalUncertain}</span>
        </div>
        <div class="breakdown-row">
          <span class="breakdown-label">Likely Human (<0.35)</span>
          <span class="breakdown-count count-human">${totalHuman}</span>
        </div>
      </div>

      <div class="section-title">Highest AI Scores</div>
      ${topAI.map(post => {
        const score = post.finalScore ?? post.aiScore;
        let scoreClass;
        if (score >= 0.6) scoreClass = 'count-ai';
        else if (score >= 0.35) scoreClass = 'count-uncertain';
        else scoreClass = 'count-human';

        const platformEmoji = post.platform === 'twitter' ? '𝕏' : '💼';

        return `
          <div class="recent-post">
            <div class="recent-header">
              <span class="recent-author">${platformEmoji} @${post.authorHandle || 'unknown'}</span>
              <span class="recent-score ${scoreClass}">${score.toFixed(2)}</span>
            </div>
            <div class="recent-text">
              ${Array.from(post.text).slice(0, 90).join('')}${post.text.length > 90 ? '...' : ''}
            </div>
            ${post.aiBuzzwords && post.aiBuzzwords.length > 0 ? `
              <div class="buzzwords">🏷️ ${post.aiBuzzwords.join(', ')}</div>
            ` : ''}
          </div>
        `;
      }).join('')}

      <div class="btn-row">
        <button class="btn-export" id="exportBtn">📥 Export CSV</button>
        <button class="btn-clear" id="clearBtn">🗑️ Clear Data</button>
      </div>
    `;

    container.innerHTML = html;

    document.getElementById('exportBtn').addEventListener('click', exportCSV);
    document.getElementById('clearBtn').addEventListener('click', clearData);

    initToggle();
  });
}

function exportCSV() {
  chrome.storage.local.get(['posts'], (result) => {
    const posts = result.posts || [];
    if (posts.length === 0) return;

    const headers = 'platform,author,wordCount,localScore,localLabel,apiScore,apiLabel,finalScore,finalLabel,likes,comments,reposts,views,buzzwords,text\n';
    const rows = posts.map(p => {
      const score = p.finalScore ?? p.aiScore;
      const label = score >= 0.6 ? 'Likely AI' : score >= 0.35 ? 'Uncertain' : 'Likely Human';
      
      const safeText = (p.text || '').replace(/"/g, "'").replace(/\n/g, ' ').replace(/\r/g, '');
      const buzzwords = (p.aiBuzzwords || []).join('; ');
      const e = p.engagement || {};
      
      return `"${p.platform}","${p.authorHandle || ''}",${p.wordCount || 0},${p.aiScore || 0},"${p.aiLabel || ''}",${p.apiScore ?? ''},"${p.apiLabel || ''}",${p.finalScore ?? ''},"${label}",${e.likes ?? ''},${e.comments ?? e.replies ?? ''},${e.reposts ?? ''},${e.views ?? ''},"${buzzwords}","${safeText}"`;
    }).join('\n');

    const csv = '\uFEFF' + headers + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai_detector_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function clearData() {
  if (confirm('Clear all captured posts?')) {
    chrome.storage.local.set({ posts: [] }, () => {
      loadDashboard();
    });
  }
}

function initToggle() {
  chrome.storage.local.get(['scannerEnabled'], (result) => {
    // Default to enabled if not set
    const enabled = result.scannerEnabled !== false;
    updateToggleUI(enabled);

    document.getElementById('toggleBtn').addEventListener('click', () => {
      const newState = !document.getElementById('toggleBtn').dataset.enabled;
      const isEnabled = newState !== false && newState !== 'false';

      chrome.storage.local.set({ scannerEnabled: isEnabled });
      updateToggleUI(isEnabled);

      // Send message to content script on the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TOGGLE_SCANNER',
            enabled: isEnabled
          });
        }
      });
    });
  });
}

function updateToggleUI(enabled) {
  const statusEl = document.getElementById('scannerStatus');
  const btnEl = document.getElementById('toggleBtn');
  if (!statusEl || !btnEl) return;

  if (enabled) {
    statusEl.textContent = 'ACTIVE';
    statusEl.className = 'toggle-status active';
    btnEl.textContent = 'PAUSE';
    btnEl.dataset.enabled = 'true';
  } else {
    statusEl.textContent = 'PAUSED';
    statusEl.className = 'toggle-status paused';
    btnEl.textContent = 'RESUME';
    btnEl.dataset.enabled = '';
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});