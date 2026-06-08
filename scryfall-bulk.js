export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const { identifiers } = req.body || {};
  if (!Array.isArray(identifiers) || identifiers.length === 0)
    return res.status(400).json({ error: "Missing identifiers array" });

  const headers = {
    "User-Agent": "MTGCubeManager/1.0 (https://project-71rr6.vercel.app)",
    "Accept":     "application/json",
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method:  "POST",
      headers,
      body: JSON.stringify({ identifiers }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: "Scryfall error", detail: data });

    const found    = (data.data || []).map(card => buildCardData(card));
    const notFound = (data.not_found || []).map(id => id.name || id.id || "unknown");

    return res.status(200).json({ found, not_found: notFound });

  } catch(err) {
    return res.status(500).json({ error: "Proxy error", detail: err.message });
  }
}

function buildCardData(data) {
  const imgUris   = data.image_uris || data.card_faces?.[0]?.image_uris || {};
  const typeParts = (data.type_line || "").split(" — ");
  return {
    id:           data.id,
    name:         data.name,
    set:          data.set,
    set_name:     data.set_name,
    mana_cost:    data.mana_cost || "",
    colors:       data.colors || [],
    cmc:          data.cmc,
    type_line:    data.type_line || "",
    types:        typeParts[0]?.trim().split(" ").filter(Boolean) || [],
    subtypes:     typeParts[1]?.trim().split(" ").filter(Boolean) || [],
    oracle_text:  data.oracle_text || "",
    power:        data.power  ?? null,
    toughness:    data.toughness ?? null,
    rarity:       data.rarity,
    image_normal: imgUris.normal || "",
    image_large:  imgUris.large  || "",
  };
}
