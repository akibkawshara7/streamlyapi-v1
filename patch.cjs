const fs = require('fs');
let code = fs.readFileSync('src/server/watch.ts', 'utf8');

const rep = `  for (let i = 0; i < candidates.length; i++) {
    const res = hlsResults[i];
    if (!res || !res.hls || typeof res.hls !== "string" || !res.hls.trim()) continue;

    if (!streamIntro && res.intro) streamIntro = res.intro;
    if (!streamOutro && res.outro) streamOutro = res.outro;

    const rawUrl = res.hls.trim();
    const dedupeKey = getStreamDedupeKey(rawUrl);
    const normUrl = rawUrl.split("?")[0].toLowerCase();
    if (seenUrls.has(dedupeKey) || seenUrls.has(normUrl)) continue;

    seenUrls.add(dedupeKey);
    seenUrls.add(normUrl);

    const correspondingEmbed = embedStreams[i];
    const baseSourceName = correspondingEmbed
      ? correspondingEmbed.source.replace(/^E-/, "").replace(/^[HS]-/, "")
      : GREEK_LETTERS[(finalHls.length + finalMp4.length) % GREEK_LETTERS.length];

    let finalSourceName = baseSourceName;
    let isHardsub = false;

    if (audio === "sub") {
      const captions = formatCaptions(res.tracks || []);
      if (captions.length > 0) {
        finalSourceName = "S-" + baseSourceName;
      } else {
        finalSourceName = "H-" + baseSourceName;
        isHardsub = true;
      }
      if (correspondingEmbed) {
        correspondingEmbed.source = "E-" + finalSourceName;
      }
    }

    const isMp4 = rawUrl.toLowerCase().includes(".mp4");
    const streamObj: HlsStream & { _isHardsub?: boolean } = {
      source: finalSourceName,
      refer: referUrl,
      ...(isMp4 ? { mp4: rawUrl } : { hls: rawUrl }),
      _isHardsub: isHardsub
    };

    if (audio === "sub" && !isHardsub) {
      const captions = formatCaptions(res.tracks || []);
      if (captions.length > 0) {
        streamObj.caption = captions;
      }
    }

    if (isMp4) {
      finalMp4.push(streamObj);
    } else {
      finalHls.push(streamObj);
    }
  }

  const sortByHardsub = (a: any, b: any) => {
    if (a._isHardsub && !b._isHardsub) return -1;
    if (!a._isHardsub && b._isHardsub) return 1;
    return 0;
  };

  finalHls.sort(sortByHardsub);
  finalMp4.sort(sortByHardsub);

  embedStreams.sort((a, b) => {
    const aIsH = a.source.startsWith("E-H-");
    const bIsH = b.source.startsWith("E-H-");
    if (aIsH && !bIsH) return -1;
    if (!aIsH && bIsH) return 1;
    return 0;
  });

  finalHls.forEach(s => delete s._isHardsub);
  finalMp4.forEach(s => delete s._isHardsub);

  const result: any = {
    embed: embedStreams,
    intro: streamIntro,
    outro: streamOutro,
  };

  if (finalMp4.length > 0 && finalHls.length === 0) {
    result.mp4 = finalMp4;
  } else {
    result.hls = finalHls;
    if (finalMp4.length > 0) {
      result.mp4 = finalMp4;
    }
  }

  return result;`;

let startIndex = code.indexOf('  for (let i = 0; i < candidates.length; i++) {');
let endIndex = code.indexOf('  return result;\n}', startIndex);
if (startIndex !== -1 && endIndex !== -1) {
  let newCode = code.substring(0, startIndex) + rep + "\n" + code.substring(endIndex + 17);
  fs.writeFileSync('src/server/watch.ts', newCode);
  console.log("Patched successfully via manual slice");
} else {
  console.log("Could not find indices", startIndex, endIndex);
}
