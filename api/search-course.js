// api/search-course.js
// CommonJS serverless function (Vercel Node runtime). Do NOT use `export default`.
// Proxies GolfCourseAPI so the API key never reaches the browser.
//
// Modes:
//   GET /api/search-course?search_query=Pumpkin Ridge
//     -> passes through GolfCourseAPI's search response { courses: [...] }
//   GET /api/search-course?courseId=12345
//     -> fetches course detail and returns a NORMALIZED shape:
//        { id, name, club_name, city, state, teeName, holes: [
//            { number, par, si, yardage }, ... up to 18
//        ]}
//        so the client never has to know GolfCourseAPI's raw tee structure.

const BASE = 'https://api.golfcourseapi.com/v1';

module.exports = async (req, res) => {
  const API_KEY = process.env.GOLFCOURSE_API_KEY;

  if (!API_KEY) {
    res.status(500).json({ error: 'GOLFCOURSE_API_KEY is not configured on the server.' });
    return;
  }

  const { search_query, courseId } = req.query || {};

  try {
    if (courseId) {
      const detail = await fetchJson(`${BASE}/courses/${encodeURIComponent(courseId)}`, API_KEY);
      const normalized = normalizeCourse(detail, courseId);
      if (!normalized) {
        res.status(502).json({ error: 'Unexpected response shape from GolfCourseAPI course detail.' });
        return;
      }
      res.status(200).json(normalized);
      return;
    }

    if (search_query) {
      const results = await fetchJson(`${BASE}/search?search_query=${encodeURIComponent(search_query)}`, API_KEY);
      res.status(200).json(results);
      return;
    }

    res.status(400).json({ error: 'Provide either search_query or courseId.' });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Upstream GolfCourseAPI request failed.' });
  }
};

async function fetchJson(url, apiKey) {
  const r = await fetch(url, {
    headers: { Authorization: `Key ${apiKey}` }
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`GolfCourseAPI returned non-JSON (status ${r.status})`);
  }
  if (!r.ok) {
    throw new Error(json.error || `GolfCourseAPI error (status ${r.status})`);
  }
  return json;
}

// GolfCourseAPI's course detail nests tees under course.tees.male / course.tees.female,
// each an array of tee sets, each with a `holes` array of { par, yardage, handicap }.
// We default to the first men's/white tee set, falling back to whatever is available,
// and always return exactly the fields the client needs.
function normalizeCourse(raw, fallbackId) {
  const course = raw.course || raw;
  if (!course) return null;

  const tees = course.tees || {};
  const maleTees = Array.isArray(tees.male) ? tees.male : [];
  const femaleTees = Array.isArray(tees.female) ? tees.female : [];

  // Prefer a tee explicitly named "white", else first men's tee, else first female tee.
  let teeSet =
    maleTees.find(t => /white/i.test(t.tee_name || '')) ||
    maleTees[0] ||
    femaleTees[0];

  if (!teeSet || !Array.isArray(teeSet.holes)) {
    return null;
  }

  const holes = teeSet.holes.slice(0, 18).map((h, idx) => ({
    number: idx + 1,
    par: h.par ?? null,
    si: h.handicap ?? null,
    yardage: h.yardage ?? null
  }));

  return {
    id: String(course.id ?? fallbackId),
    name: course.course_name || course.club_name || 'Unknown Course',
    club_name: course.club_name || '',
    city: course.location?.city || course.city || '',
    state: course.location?.state || course.state || '',
    teeName: teeSet.tee_name || '',
    holes
  };
}
