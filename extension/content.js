const seenKeys = new Set();
const cachedFinalScores = new Map();

function detectPlatform() {
    const url = window.location.hostname;
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
    if (url.includes('linkedin.com')) return 'linkedin';
    return 'unknown';
}

const curPlatform = detectPlatform();
console.log(`[AI-Detector] Monitoring ${curPlatform}...`);

let scannerEnabled = true;

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_SCANNER') {
        scannerEnabled = msg.enabled;
        console.log(`[AI-Detector] Scanner ${scannerEnabled ? 'RESUMED' : 'PAUSED'}`);
    }
});

const postObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const container = entry.target;
            observer.unobserve(container);
            processPost(container);
        }
    });
}, { rootMargin: '200px 0px' });

function scanForNewContainers() {
    if (!scannerEnabled || curPlatform === 'unknown') return;

    if (curPlatform === 'twitter') {
        const articles = document.querySelectorAll('article[data-testid="tweet"]:not([data-ai-observed])');
        for (const article of articles) {
            article.setAttribute('data-ai-observed', 'true');
            postObserver.observe(article);
        }
    } else if (curPlatform === 'linkedin') {
        const listItems = document.querySelectorAll('[role="listitem"]:not([data-ai-observed])');
        for (const item of listItems) {
            item.setAttribute('data-ai-observed', 'true');
            postObserver.observe(item);
        }
    }
}

async function processPost(container) {
    if (!scannerEnabled) return;

    try {
        let post = null;
        if (curPlatform === 'twitter') {
            post = await extractTweet(container);
        } else if (curPlatform === 'linkedin') {
            post = await extractLinkedInPost(container);
        }

        if (post && post.skip) {
            container.setAttribute('data-ai-key', 'skipped');
            injectLabel(container, 'skipped');
            return;
        }

        if (post) {
            container.setAttribute('data-ai-key', hashString(post.dedupKey));
            
            if (cachedFinalScores.has(post.dedupKey)) {
                injectLabel(container, cachedFinalScores.get(post.dedupKey), true);
            } else {
                injectLabel(container, post.aiScore);
            }
            
            if (!seenKeys.has(post.dedupKey)) {
                seenKeys.add(post.dedupKey);
                
                logDetection(post);
                savePostsToStorage([post]);

                classifyWithAPI(post).then(apiResult => {
                    if (!apiResult) return;
                    
                    post.apiScore = apiResult.score;
                    post.apiLabel = apiResult.label;
                    post.apiProvider = apiResult.provider;
                    post.finalScore = computeHybridScore(post.aiScore, apiResult);

                    cachedFinalScores.set(post.dedupKey, post.finalScore);

                    console.log(
                        `[AI-Detector] 🔌 API result for @${post.authorHandle || 'unknown'}: ` +
                        `${apiResult.score} (${apiResult.provider}) → hybrid: ${post.finalScore}`
                    );

                    updateStoredPost(post);

                    const containers = findPostContainers(post.dedupKey);
                    containers.forEach(c => injectLabel(c, post.finalScore, true));
                });
            }
        } else {
            container.setAttribute('data-ai-key', 'invalid');
        }
    } catch (err) {
        console.error('[AI-Detector] Extraction error:', err.message);
    }
}

function findPostContainers(dedupKey) {
    const selector = `[data-ai-key="${hashString(dedupKey)}"]`;
    return document.querySelectorAll(selector);
}

function injectLabel(container, score, isFinal = false) {
    let badge = container.querySelector('.ai-badge-inline');
    if (badge) {
        if (isFinal) {
            badge.innerHTML = `AI ${Math.round(score * 100)}% <span class="badge-tag">API verified</span>`;
            badge.className = `ai-badge-inline ${getBadgeClass(score)} final-badge`;
        }
        return;
    }

    badge = document.createElement('div');
    
    if (score === 'skipped') {
        badge.className = 'ai-badge-inline badge-skipped';
        badge.innerHTML = `Too short to detect`;
        badge.title = "Texts under 20 words have high statistical variance and are ignored for accuracy.";
    } else {
        badge.className = `ai-badge-inline ${getBadgeClass(score)}`;
        badge.innerHTML = `AI ${Math.round(score * 100)}% ${isFinal ? '<span class="badge-tag">API verified</span>' : ''}`;
    }
    
    container.style.position = 'relative';
    container.appendChild(badge);
}

function getBadgeClass(score) {
    if (score >= 0.6) return 'badge-danger';
    if (score >= 0.35) return 'badge-warning';
    return 'badge-safe';
}

function logDetection(post) {
    console.log(
        `[AI-Detector] Score: ${post.aiScore} | Label: ${post.aiLabel} | ` +
        `Platform: ${post.platform} | User: @${post.authorHandle || 'unknown'} | ` +
        `Words: ${post.wordCount} | Text: ${safeSlice(post.text, 0, 70)}...`
    );

    if (post.engagement) {
        const e = post.engagement;
        const parts = [];
        if (e.likes != null) parts.push(`Likes: ${e.likes}`);
        if (e.replies != null) parts.push(`Replies: ${e.replies}`);
        if (e.comments != null) parts.push(`Comments: ${e.comments}`);
        if (e.reposts != null) parts.push(`Reposts: ${e.reposts}`);
        if (e.views != null) parts.push(`Views: ${e.views}`);
        if (parts.length > 0) console.log(`  > Engagement: ${parts.join(' | ')}`);
    }

    if (post.aiScore >= 0.35) {
        console.log(`  > Details:`, post.aiDetails);
        if (post.aiBuzzwords && post.aiBuzzwords.length > 0) {
            console.log(`  > Buzzwords: ${post.aiBuzzwords.join(', ')}`);
        }
    }
}

let activeObserver = null;

function startObserver() {
    let target = null;

    if (curPlatform === 'twitter') {
        target = document.querySelector('[data-testid="primaryColumn"]')
            || document.querySelector('main');
    }

    if (curPlatform === 'linkedin') {
        target = document.querySelector('main')
            || document.querySelector('[role="main"]');
    }

    if (!target) {
        console.log('[AI-Detector] Page not ready, retrying in 2s...');
        setTimeout(startObserver, 2000);
        return;
    }

    if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
    }

    console.log(`[AI-Detector] Feed found on ${curPlatform}, starting observer`);
    scanForNewContainers();

    let debounceTimer = null;
    activeObserver = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(scanForNewContainers, 50);
    });

    activeObserver.observe(target, { childList: true, subtree: true });
    console.log('[AI-Detector] Watching for new posts...');
}

new Promise(r => chrome.storage.local.get(['posts', 'scannerEnabled'], result => {
    (result.posts || []).forEach(p => seenKeys.add(p.dedupKey));
    scannerEnabled = result.scannerEnabled !== false;
    console.log(`[AI-Detector] Loaded ${seenKeys.size} previously captured posts | Scanner: ${scannerEnabled ? 'ACTIVE' : 'PAUSED'}`);
    r();
})).then(() => {
    setTimeout(startObserver, 3000);
});

let lastUrl = location.href;
setInterval(() => {
    if (location.href !== lastUrl) {
        console.log(`[AI-Detector] SPA navigation detected: ${lastUrl} -> ${location.href}`);
        lastUrl = location.href;
        setTimeout(startObserver, 2000);
    }
}, 2000);

window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data.type?.startsWith('AI_DETECTOR')) return;
    
    if (event.data.type === 'AI_DETECTOR_STATS') {
        chrome.storage.local.get(['posts'], result => {
            console.log(`[AI-Detector] Total stored: ${result.posts?.length || 0}`);
        });
    }
});