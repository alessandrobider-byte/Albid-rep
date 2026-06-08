export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { name, set } = req.query;
  if (!name) return res.status(400).json({ error: "Missing card name" });

  try {
    const url = set
      ? `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}&set=${encodeURIComponent(set)}`
      : `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;

    const response = await fetch(url);
    const text = await response.text();

    // Return raw Scryfall response for debugging
    return res.status(200).json({
      debug_url: url,
      debug_status: response.status,
      debug_body: text.slice(0, 500)
    });

  } catch(err) {
    return res.status(500).json({ error: "Proxy error", detail: err.message });
  }
}
