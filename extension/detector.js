function detectAI(text) {
  const scores = {};
  const lowerText = text.toLowerCase();
  const words = text.split(/\s+/);
  const wordCount = words.length;

  const generalBuzzwords = [
    'delve', 'tapestry', 'realm', 'ever-evolving',
    'game-changer', 'paradigm shift', 'it\'s worth noting',
    'in today\'s rapidly', 'comprehensive guide',
    'in the realm of', 'holistic approach',
    'synergy', 'multifaceted', 'pivotal role',
    'underscores the', 'unpack this', 'deep dive',
    'without further ado', 'it is important to note',
    'a testament to', 'at the end of the day',
    'navigating the'
  ];

  const linkedinAIPhrases = [
    'here\'s what i learned',
    'here\'s the truth',
    'here are my',
    'here\'s why',
    'let that sink in',
    'read that again',
    'i\'ll say it louder',
    'hot take',
    'unpopular opinion',
    'this changed everything',
    'and it changed my life',
    'from intern to',
    'from zero to',
    'my journey from',
    'began her journey',
    'began his journey',
    'started my journey',
    'what drives',
    'a shared purpose',
    'here\'s what most people get wrong',
    'nobody talks about',
    'nobody is talking about',
    'stop doing this',
    'do this instead',
    'the secret to',
    'i was wrong about',
    'what i wish i knew',
    'years ago i',
    'grateful, proud',
    'proud to announce',
    'thrilled to share',
    'excited to announce',
    'humbled to',
    'blessed to',
    'follow for more',
    'follow me for',
    'share your thoughts',
    'agree or disagree',
    'thoughts\\?',
    'comment below',
    'repost if you agree',
    'share if you',
    'tag someone who',
    'save this for later'
  ];

  const corporateBuzzwords = [
    'leverage', 'passionate about', 'driven by',
    'making an impact', 'purpose-driven', 'thought leadership',
    'value proposition', 'stakeholders', 'ecosystem',
    'empower', 'innovative solutions', 'cutting-edge',
    'best practices', 'actionable insights', 'scalable',
    'streamline', 'optimize', 'transform',
    'foster', 'cultivate', 'spearhead',
    'pioneer', 'revolutionize', 'disrupt'
  ];

  const generalHits = generalBuzzwords.filter(w => lowerText.includes(w));
  const linkedinHits = linkedinAIPhrases.filter(w => lowerText.includes(w));
  const corporateHits = corporateBuzzwords.filter(w => lowerText.includes(w));

  scores.generalBuzzwords = Math.min(generalHits.length * 0.15, 0.4);
  scores.linkedinPhrases = Math.min(linkedinHits.length * 0.2, 0.5);
  scores.corporateSpeak = Math.min(corporateHits.length * 0.1, 0.3);

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 3);

  scores.burstiness = 0;
  if (sentences.length >= 4) {
    const lengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 3) scores.burstiness = 0.2;
    else if (stdDev < 5) scores.burstiness = 0.1;
    else scores.burstiness = 0;
  }

  scores.ttr = 0;
  if (wordCount >= 30) {
    const chunkSize = 50;
    const ttrValues = [];

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize);
      if (chunk.length < 20) break;
      const tokens = chunk.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean);
      const types = new Set(tokens);
      if (tokens.length > 0) {
        ttrValues.push(types.size / tokens.length);
      }
    }

    if (ttrValues.length > 0) {
      const avgTTR = ttrValues.reduce((a, b) => a + b, 0) / ttrValues.length;

      if (avgTTR > 0.82) scores.ttr = 0.15;
      else if (avgTTR > 0.72) scores.ttr = 0.05;
      else scores.ttr = 0;
    }
  }

  const lines = text.split('\n').filter(l => l.trim().length > 0);
  
  scores.linkedinStructure = 0;

  if (lines.length >= 3) {
    const firstLineWords = lines[0].trim().split(/\s+/).length;

    if (firstLineWords <= 10 && wordCount > 50) {
      scores.linkedinStructure += 0.1;
    }

    const shortLines = lines.filter(l => l.trim().split(/\s+/).length <= 8);
    const shortLineRatio = shortLines.length / lines.length;
    if (shortLineRatio > 0.6 && lines.length > 5) {
      scores.linkedinStructure += 0.15;
    }
  }

  const hasNumberedList = /\n\s*\d+[\.\)]\s/m.test(text);
  const hasBulletList = /\n\s*[•\-\*✅❌→➡️▶️]\s/m.test(text);
  const hasEmojiList = /\n\s*[🔹🔸📌💡🎯✨⭐🚀💥🔥]\s/m.test(text);
  scores.lists = 0;
  if (hasNumberedList) scores.lists += 0.1;
  if (hasBulletList) scores.lists += 0.1;
  if (hasEmojiList) scores.lists += 0.15;

  const startsWithHook = /^(here'?s|what|why|how|the truth|i asked|unpopular|hot take|stop|nobody|everyone|most people)/i.test(text.trim());
  const endsWithCTA = /\b(what do you think|agree|thoughts\??|share your|comment below|let me know|follow for more|repost|save this|tag someone)\s*[.!?🙌👇💬]*\s*$/i.test(text.trim());

  scores.engagementBait = 0;
  if (startsWithHook) scores.engagementBait += 0.1;
  if (endsWithCTA) scores.engagementBait += 0.15;
  if (startsWithHook && endsWithCTA) scores.engagementBait += 0.1;

  const emojiMatches = text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}✅❌]/gu) || [];
  const emojiCount = emojiMatches.length;

  scores.emojiPattern = 0;
  if (emojiCount >= 3 && emojiCount <= 8 && wordCount > 50) {
    scores.emojiPattern = 0.1;
  }

  const hasSlang = /\b(lol|lmao|ngl|idk|imo|tbh|bruh|fr|smh|fml|nah|gonna|wanna|gotta|bro|dude|crap|damn|shit|wtf|omg)\b/i.test(text);
  const hasTypos = /\b(teh|dont|cant|wont|im|ive|youre|theyre|thats|didnt|isnt|wasnt|doesnt)\b/.test(text);
  const hasCasualTone = /\b(haha|hehe|hmm|umm|well\.\.\.|okay so|so basically|like literally)\b/i.test(text);
  const hasEmojiCluster = /[\u{1F600}-\u{1F64F}]{2,}/u.test(text);

  scores.humanSignals = 0;
  if (hasSlang) scores.humanSignals -= 0.15;
  if (hasTypos) scores.humanSignals -= 0.05;
  if (hasCasualTone) scores.humanSignals -= 0.1;
  if (hasEmojiCluster) scores.humanSignals -= 0.05;

  const formalPhrases = [
    'furthermore', 'moreover', 'additionally',
    'it is essential', 'one must consider',
    'in this regard', 'consequently',
    'nevertheless', 'notwithstanding',
    'in conclusion', 'to summarize',
    'it goes without saying', 'needless to say'
  ];
  const formalHits = formalPhrases.filter(p => lowerText.includes(p));
  scores.formality = Math.min(formalHits.length * 0.1, 0.2);

  scores.repetitionPatterns = 0;

  if (sentences.length >= 4) {
    const starters = sentences.map(s => {
      const w = s.trim().split(/\s+/);
      return w[0]?.toLowerCase();
    }).filter(Boolean);

    let consecutiveRepeats = 0;
    for (let i = 1; i < starters.length; i++) {
      if (starters[i] === starters[i - 1]) consecutiveRepeats++;
    }
    const anaphoraRatio = consecutiveRepeats / (starters.length - 1);
    if (anaphoraRatio > 0.4) scores.repetitionPatterns += 0.1;
    else if (anaphoraRatio > 0.25) scores.repetitionPatterns += 0.05;

    const uniqueStarters = new Set(starters).size;
    const starterDiversity = uniqueStarters / starters.length;
    if (starterDiversity < 0.4) scores.repetitionPatterns += 0.1;
    else if (starterDiversity < 0.55) scores.repetitionPatterns += 0.05;
  }

  const transitions = [
    'furthermore', 'moreover', 'additionally', 'consequently',
    'however', 'nevertheless', 'therefore', 'thus',
    'in addition', 'as a result', 'on the other hand',
    'that said', 'that being said', 'with that in mind',
    'to that end', 'in light of', 'by the same token',
    'equally important', 'not only', 'but also'
  ];
  const transitionCount = transitions.filter(t => lowerText.includes(t)).length;
  const transitionsPerSentence = sentences.length > 0 ? transitionCount / sentences.length : 0;
  if (transitionsPerSentence > 0.33) scores.repetitionPatterns += 0.1;
  else if (transitionsPerSentence > 0.2) scores.repetitionPatterns += 0.05;

  const tricolonRegex = /\b\w+,\s+\w+,?\s+and\s+\w+/gi;
  const tricolonMatches = text.match(tricolonRegex) || [];
  if (tricolonMatches.length >= 3) scores.repetitionPatterns += 0.1;
  else if (tricolonMatches.length >= 2) scores.repetitionPatterns += 0.05;

  scores.repetitionPatterns = Math.min(scores.repetitionPatterns, 0.3);

  scores.lengthBonus = 0;
  if (wordCount > 150) scores.lengthBonus = 0.05;
  if (wordCount > 300) scores.lengthBonus = 0.1;

  const rawScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
  const finalScore = Math.max(0, Math.min(1, Math.round(rawScore * 100) / 100));

  let label;
  if (finalScore >= 0.6) label = 'likely_ai';
  else if (finalScore >= 0.35) label = 'uncertain';
  else label = 'likely_human';

  const allBuzzwords = [...generalHits, ...linkedinHits, ...corporateHits];

  return {
    score: finalScore,
    label: label,
    details: scores,
    buzzwordsFound: allBuzzwords
  };
}