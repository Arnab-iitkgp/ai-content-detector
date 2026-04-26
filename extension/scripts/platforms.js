const expandedElements = new WeakSet();

async function expandPost(container) {
    if (expandedElements.has(container)) return false;
    expandedElements.add(container);

    const cssSelectors = [
        'button.feed-shared-inline-show-more-text',
        '.feed-shared-text__see-more',
        '[data-test-id="inline-show-more-text"]',
        '.feed-shared-inline-show-more-text',
        '[data-testid="tweet-text-show-more-link"]',
        '[data-control-name="see_more"]',
        '.see-more',
        '.show-more'
    ];

    for (const selector of cssSelectors) {
        const btn = container.querySelector(selector);
        if (btn) {
            simulateClick(btn);
            console.log(`[AI-Detector] 📖 Clicked "see more" via selector: ${selector}`);
            await delay(500);
            return true;
        }
    }

    const allElements = container.querySelectorAll('button, a, span, div[role="button"], span[role="button"]');
    for (const el of allElements) {
        const rawText = (el.textContent || '').trim().toLowerCase();
        const normalized = rawText
            .replace(/…/g, '')
            .replace(/\.\.\./g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (
            normalized === 'see more' ||
            normalized === 'show more' ||
            normalized === 'more' ||
            rawText === '…see more' ||
            rawText === '...see more' ||
            rawText === '…more'
        ) {
            const textLenBefore = container.innerText.length;
            simulateClick(el);
            console.log(`[AI-Detector] Clicked "see more" via text: "${rawText}"`);

            for (let i = 0; i < 30; i++) {
                await delay(100);
                if (container.innerText.length > textLenBefore) {
                    console.log(`[AI-Detector] Text expanded: ${textLenBefore} -> ${container.innerText.length} chars`);
                    break;
                }
            }
            return true;
        }

        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        if (aria.includes('see more') || aria.includes('show more') || aria.includes('expand')) {
            const textLenBefore = container.innerText.length;
            simulateClick(el);
            console.log(`[AI-Detector] Clicked "see more" via aria-label: "${aria}"`);

            for (let i = 0; i < 30; i++) {
                await delay(100);
                if (container.innerText.length > textLenBefore) {
                    console.log(`[AI-Detector] Text expanded: ${textLenBefore} -> ${container.innerText.length} chars`);
                    break;
                }
            }
            return true;
        }
    }

    console.log(`[AI-Detector] ℹ️ No "see more" button found in post`);
    return false;
}

function extractFullText(container) {
    const expandableBox = container.querySelector('[data-testid="expandable-text-box"]');
    if (expandableBox) {
        const text = expandableBox.innerText.trim();
        if (text.length > 30) return text;
    }

    const textContainerSelectors = [
        '.feed-shared-text',
        '.feed-shared-update-v2__description',
        '.update-components-text',
        '[data-test-id="main-feed-activity-card__commentary"]',
        '.feed-shared-text__text-view',
    ];

    for (const selector of textContainerSelectors) {
        const textContainer = container.querySelector(selector);
        if (textContainer) {
            const text = textContainer.innerText.trim();
            if (text.length > 30) return text;
        }
    }

    const dirSpans = container.querySelectorAll('span[dir="ltr"]');
    if (dirSpans.length > 0) {
        let bestParent = null;
        let bestLen = 0;
        dirSpans.forEach(span => {
            const parent = span.parentElement;
            if (parent) {
                const parentText = parent.innerText || '';
                if (parentText.length > bestLen) {
                    bestLen = parentText.length;
                    bestParent = parent;
                }
            }
        });
        if (bestParent && bestLen > 30) return bestParent.innerText.trim();
    }

    let longestSpan = '';
    container.querySelectorAll('span').forEach(span => {
        const t = span.innerText || '';
        if (t.length > longestSpan.length) longestSpan = t;
    });
    return longestSpan.trim();
}

function parseCount(str) {
    if (!str) return null;
    const clean = str.replace(/,/g, '').trim();
    const match = clean.match(/([\d.]+)\s*([KkMmBb]?)/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    const suffix = match[2].toUpperCase();
    if (suffix === 'K') return Math.round(num * 1000);
    if (suffix === 'M') return Math.round(num * 1000000);
    if (suffix === 'B') return Math.round(num * 1000000000);
    return Math.round(num);
}

function extractCountFromEl(el) {
    if (!el) return null;
    const aria = el.getAttribute('aria-label') || '';
    const ariaNum = parseCount(aria);
    if (ariaNum !== null) return ariaNum;
    return parseCount(el.textContent);
}

function extractTwitterEngagement(article) {
    const engagement = { likes: null, replies: null, reposts: null, views: null };

    const likeBtn = article.querySelector('[data-testid="like"]') 
                 || article.querySelector('[data-testid="unlike"]');
    const replyBtn = article.querySelector('[data-testid="reply"]');
    const retweetBtn = article.querySelector('[data-testid="retweet"]');
    const viewsEl = article.querySelector('a[href*="/analytics"]');

    engagement.likes = extractCountFromEl(likeBtn);
    engagement.replies = extractCountFromEl(replyBtn);
    engagement.reposts = extractCountFromEl(retweetBtn);
    engagement.views = extractCountFromEl(viewsEl);

    return engagement;
}

function extractLinkedInEngagement(listItem) {
    const engagement = { likes: null, comments: null, reposts: null };

    const allSpans = listItem.querySelectorAll('span, button');
    for (const el of allSpans) {
        const text = (el.textContent || '').toLowerCase().trim();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();

        if (aria.includes('reaction') || text.match(/^\d[\d,.kKmM]*\s*reaction/)) {
            engagement.likes = parseCount(el.textContent);
        }
        if (text.match(/^\d[\d,.kKmM]*\s*comment/) || aria.includes('comment')) {
            engagement.comments = parseCount(el.textContent);
        }
        if (text.match(/^\d[\d,.kKmM]*\s*repost/) || aria.includes('repost')) {
            engagement.reposts = parseCount(el.textContent);
        }
    }

    return engagement;
}

async function extractTweet(article) {
    await expandPost(article);
    const textEl = article.querySelector('[data-testid="tweetText"]');
    if (!textEl) return null;

    const text = textEl.textContent || textEl.innerText;
    const wordCount = text ? text.trim().split(/\s+/).length : 0;
    if (!text) return null;
    if (wordCount < 20) return { skip: 'short' };

    const dedupKey = safeSlice(text, 0, 80);

    let authorHandle = null;
    const userLinks = article.querySelectorAll('a[role="link"]');
    for (const link of userLinks) {
        const href = link.getAttribute('href');
        if (href && /^\/[A-Za-z0-9_]{1,15}$/.test(href)) {
            authorHandle = href.substring(1);
            break;
        }
    }

    const aiResult = detectAI(text);
    const engagement = extractTwitterEngagement(article);

    return {
        dedupKey, platform: 'twitter', authorHandle,
        text, wordCount: text.split(/\s+/).length,
        capturedAt: new Date().toISOString(),
        aiScore: aiResult.score,
        aiLabel: aiResult.label,
        aiDetails: aiResult.details,
        aiBuzzwords: aiResult.buzzwordsFound,
        engagement
    };
}

async function extractLinkedInPost(listItem) {
    const buttons = listItem.querySelectorAll('button');
    const hasLike = Array.from(buttons).some(b => {
        const text = b.innerText.toLowerCase().trim();
        return text === 'like' || text.startsWith('like');
    });
    
    const hasLikeAria = Array.from(buttons).some(b => {
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        return aria.includes('reaction') || aria.includes('like');
    });

    if (!hasLike && !hasLikeAria) return null;

    const expanded = await expandPost(listItem);
    if (expanded) await delay(500);

    const text = extractFullText(listItem);
    const wordCount = text ? text.trim().split(/\s+/).length : 0;
    if (!text) return null;
    if (wordCount < 20) return { skip: 'short' };

    const dedupKey = safeSlice(text, 0, 80);

    let authorHandle = null;
    const authorLink = listItem.querySelector('a[href*="/in/"]');
    if (authorLink) {
        const match = authorLink.getAttribute('href').match(/\/in\/([^/?]+)/);
        if (match) authorHandle = match[1];
    }

    const aiResult = detectAI(text);
    const engagement = extractLinkedInEngagement(listItem);

    return {
        dedupKey, platform: 'linkedin', authorHandle,
        text, wordCount: text.split(/\s+/).length,
        capturedAt: new Date().toISOString(),
        aiScore: aiResult.score,
        aiLabel: aiResult.label,
        aiDetails: aiResult.details,
        aiBuzzwords: aiResult.buzzwordsFound,
        engagement
    };
}
