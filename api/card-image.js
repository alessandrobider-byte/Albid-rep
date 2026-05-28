export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "Missing card name" });

  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
    );
    const data = await response.json();

    if (!response.ok || data.object === "error") {
      return res.status(404).json({ error: "Card not found" });
    }

    const imgUris = data.image_uris || data.card_faces?.[0]?.image_uris || {};
    const imageUrl = imgUris.normal || imgUris.large || "";

    if (!imageUrl) return res.status(404).json({ error: "No image found" });

    // Redirect to the actual Scryfall image
    return res.redirect(302, imageUrl);

  } catch {
    return res.status(500).json({ error: "Proxy error" });
  }
}
