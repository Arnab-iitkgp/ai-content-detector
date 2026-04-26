function safeSlice(text, start, end) {
    if (!text) return '';
    const chars = Array.from(text);
    return chars.slice(start, end).join('');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

function simulateClick(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
}

function savePostsToStorage(newPosts) {
    console.log(`[AI-Detector] 💾 Attempting to save ${newPosts.length} posts...`);
    chrome.storage.local.get(['posts'], (result) => {
        if (chrome.runtime.lastError) {
            console.error('[AI-Detector] ❌ Storage Get Error:', chrome.runtime.lastError);
            return;
        }
        const existing = result.posts || [];
        const updated = [...existing, ...newPosts];
        chrome.storage.local.set({ posts: updated }, () => {
            if (chrome.runtime.lastError) {
                console.error('[AI-Detector] ❌ Storage Set Error:', chrome.runtime.lastError);
            } else {
                console.log(
                    `[AI-Detector] ✅ Saved ${newPosts.length} new | Total stored: ${updated.length}`
                );
            }
        });
    });
}

function updateStoredPost(updatedPost) {
    chrome.storage.local.get(['posts'], (result) => {
        const posts = result.posts || [];
        const idx = posts.findIndex(p => p.dedupKey === updatedPost.dedupKey);
        if (idx !== -1) {
            posts[idx] = { ...posts[idx], ...updatedPost };
            chrome.storage.local.set({ posts });
        }
    });
}
