const WORKER_CONFIG = {
    endpoint: 'http://127.0.0.1:8787/',
    maxRetries: 5,
    rateLimitMs: 800,
    timeoutMs: 15000,
    enabled: true
};

const apiQueue = [];
let isProcessingQueue = false;

function classifyWithAPI(postData) {
    if (!WORKER_CONFIG.enabled || !WORKER_CONFIG.endpoint) {
        console.warn('[AI-Detector] ⚠️ Worker URL not configured, using local heuristics.');
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        apiQueue.unshift({ postData, resolve, retries: 0 });
        processAPIQueue();
    });
}

async function processAPIQueue() {
    if (isProcessingQueue || apiQueue.length === 0) return;
    isProcessingQueue = true;

    while (apiQueue.length > 0) {
        const { postData, resolve, retries } = apiQueue.shift();

        try {
            const result = await callWorker(postData);
            resolve(result);
        } catch (err) {
            if (retries < WORKER_CONFIG.maxRetries) {
                const baseDelay = err.message && err.message.includes('429') ? 3000 : 1000;
                const backoffMs = Math.pow(2, retries) * baseDelay;
                console.warn(`[AI-Detector] ⚠️ Worker retry ${retries + 1}/${WORKER_CONFIG.maxRetries} in ${backoffMs}ms`);
                await delay(backoffMs);
                apiQueue.unshift({ postData, resolve, retries: retries + 1 });
            } else {
                console.error('[AI-Detector] ❌ Worker failed after retries:', err.message);
                resolve(null);
            }
        }

        if (apiQueue.length > 0) {
            await delay(WORKER_CONFIG.rateLimitMs);
        }
    }

    isProcessingQueue = false;
}

async function callWorker(postData) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WORKER_CONFIG.timeoutMs);

    try {
        const response = await fetch(WORKER_CONFIG.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: postData.text,
                platform: postData.platform,
                engagement: postData.engagement
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
            throw new Error('Rate limited (429)');
        }

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Worker Error ${response.status}: ${errBody}`);
        }

        const data = await response.json();

        return {
            score: data.score,
            label: data.score > 0.6 ? 'likely_ai' : data.score > 0.35 ? 'uncertain' : 'likely_human',
            provider: 'sapling-via-worker',
            sentenceScores: data.sentence_scores || [],
            raw: data
        };
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

function computeHybridScore(localScore, apiResult) {
    if (!apiResult || apiResult.score === null || apiResult.score === undefined) {
        return localScore;
    }
    const hybrid = localScore * 0.3 + apiResult.score * 0.7;
    return Math.round(hybrid * 100) / 100;
}
