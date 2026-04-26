export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { 
        status: 405,
        headers: corsHeaders
      });
    }

    try {
      const body = await request.json();
      const { text, platform, engagement } = body;

      if (!text || text.length < 30) {
        return new Response("Text too short", { 
          status: 400,
          headers: corsHeaders
        });
      }

      const saplingRes = await fetch("https://api.sapling.ai/api/v1/aidetect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          key: env.SAPLING_API_KEY, 
          text: text,
          sent_scores: true
        })
      });

      if (!saplingRes.ok) {
        const errorText = await saplingRes.text();
        return new Response(`Sapling API Error: ${errorText}`, { 
          status: saplingRes.status,
          headers: corsHeaders
        });
      }

      const saplingData = await saplingRes.json();
      const score = saplingData.score;
      const label = score >= 0.6 ? 'Likely AI' : score >= 0.35 ? 'Uncertain' : 'Likely Human';

      try {
        if (env.DB) {
          await env.DB.prepare(`
            INSERT INTO detections (
              platform, author_handle, content_text, word_count, 
              ai_score, ai_label, likes, comments, reposts
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            platform || 'unknown',
            body.authorHandle || null,
            text,
            text.split(/\s+/).length,
            score,
            label,
            engagement?.likes || 0,
            engagement?.comments || 0,
            engagement?.reposts || 0
          ).run();
          console.log(`[Research Log] Saved post to central database (${platform})`);
        }
      } catch (dbErr) {
        console.error("Database Save Error:", dbErr.message);
      }

      return new Response(JSON.stringify(saplingData), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }
};
