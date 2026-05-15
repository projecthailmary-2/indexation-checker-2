// pages/api/steps/step9-10.js
// Step 9: Count indexed Sequoia & VB per domain
// Step 10: Calculate indexation rates — capped at 100%
// Step 11: Combined rate (Col K) and Priority Score (Col L)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { postLinks, trackerDomains } = req.body;
  if (!postLinks || !trackerDomains) return res.status(400).json({ error: 'missing data' });

  // Step 9: aggregate indexed counts per domain
  const statsMap = {};
  for (const item of postLinks) {
    const key = (item.domain || '').toLowerCase().trim();
    if (!statsMap[key]) statsMap[key] = { sequoia: 0, videoBridge: 0, indexedSequoia: 0, indexedVideoBridge: 0 };
    if (item.taskType === 'Sequoia') statsMap[key].sequoia++;
    if (item.taskType === 'Video Bridge') statsMap[key].videoBridge++;
    if (item.indexStatus === 'Indexed') {
      if (item.taskType === 'Sequoia') statsMap[key].indexedSequoia++;
      if (item.taskType === 'Video Bridge') statsMap[key].indexedVideoBridge++;
    }
  }

  const results = trackerDomains.map(domain => {
    const key = (domain || '').toLowerCase().trim();
    const s = statsMap[key] || { sequoia: 0, videoBridge: 0, indexedSequoia: 0, indexedVideoBridge: 0 };

    // Step 10: rates — capped at 100%
    const seqRate = s.sequoia > 0 ? Math.min(s.indexedSequoia / s.sequoia, 1.0) : 0;
    const vbRate = s.videoBridge > 0 ? Math.min(s.indexedVideoBridge / s.videoBridge, 1.0) : 0;

    // Step 11: Combined rate (Col K)
    const totalCombined = s.sequoia + s.videoBridge;
    const indexedCombined = s.indexedSequoia + s.indexedVideoBridge;
    const combinedRate = totalCombined > 0 ? Math.min(indexedCombined / totalCombined, 1.0) : null;

    // Step 11: Priority Score (Col L)
    // IF((E+H)=0,"N/A", ROUNDUP(IF(K>G, ((E-F)*10+(H-I))*K, ((E-F)*10+(H-I))*G)))
    let priorityScore = null;
    if (totalCombined > 0) {
      const unindexedSeqWeighted = (s.sequoia - s.indexedSequoia) * 10;
      const unindexedVB = s.videoBridge - s.indexedVideoBridge;
      const baseScore = unindexedSeqWeighted + unindexedVB;
      const multiplier = (combinedRate !== null && combinedRate > seqRate) ? combinedRate : seqRate;
      priorityScore = Math.ceil(baseScore * multiplier);
    }

    return {
      domain,
      totalSequoia: s.sequoia,
      indexedSequoia: s.indexedSequoia,
      seqRate,
      totalVideoBridge: s.videoBridge,
      indexedVideoBridge: s.indexedVideoBridge,
      vbRate,
      combinedRate,
      priorityScore,
    };
  });

  return res.status(200).json({ results });
}
