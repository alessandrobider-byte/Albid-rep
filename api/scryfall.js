export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { name, set } = req.query;
  if (!name) return res.status(400).json({ error: "Missing card name" });

  const headers = {
    "User-Agent": "MTGCubeManager/1.0 (https://project-71rr6.vercel.app)",
    "Accept": "application/json"
  };

  try {
    const url = set
      ? `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}&set=${encodeURIComponent(set)}`
      : `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;

    const response = await fetch(url, { headers });
    const data     = await response.json();

    if (!response.ok || data.object === "error") {
      if (set) {
        const fallback = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, { headers });
        const fb = await fallback.json();
        if (!fallback.ok || fb.object === "error") return res.status(404).json({ error: "Card not found" });
        return buildResponse(res, fb);
      }
      return res.status(404).json({ error: "Card not found" });
    }

    return buildResponse(res, data);
  } catch {
    return res.status(500).json({ error: "Proxy error" });
  }
}

function buildResponse(res, data) {
  return res.status(200).json(buildCardData(data));
}

function buildCardData(data) {
  const isDFC     = Array.isArray(data.card_faces) && data.card_faces.length >= 2;
  const frontFace = isDFC ? data.card_faces[0] : null;

  // Image: for DFC with per-face images, use front face; otherwise top-level
  const imgUris   = (isDFC && frontFace.image_uris) ? frontFace.image_uris
                  : (data.image_uris || {});

  // Colors: top-level colors is correct for DFC (Scryfall sets it to front face colors)
  // Fallback to color_identity if colors is empty (some DFCs)
  const colors    = data.colors?.length ? data.colors
                  : (frontFace?.colors || data.color_identity || []);

  // Mana cost: front face for DFC
  const manaCost  = data.mana_cost || frontFace?.mana_cost || "";

  // Oracle text: front face for DFC (top-level may be absent)
  const oracleText = data.oracle_text || frontFace?.oracle_text || "";

  const typeParts = (data.type_line || frontFace?.type_line || "").split(" — ");

  const cardFaces = isDFC
    ? data.card_faces.map(f => ({
        name:        f.name        || "",
        mana_cost:   f.mana_cost   || "",
        type_line:   f.type_line   || "",
        oracle_text: f.oracle_text || "",
        power:       f.power       ?? null,
        toughness:   f.toughness   ?? null,
        image_uris:  f.image_uris  || null,
      }))
    : null;

  return {
    id:           data.id,
    name:         data.name,
    set:          data.set,
    set_name:     data.set_name,
    mana_cost:    manaCost,
    colors,
    cmc:          data.cmc,
    type_line:    data.type_line || frontFace?.type_line || "",
    types:        typeParts[0]?.trim().split(" ").filter(Boolean) || [],
    subtypes:     typeParts[1]?.trim().split(" ").filter(Boolean) || [],
    oracle_text:  oracleText,
    power:        data.power     ?? null,
    toughness:    data.toughness ?? null,
    rarity:       data.rarity,
    image_normal: imgUris.normal || "",
    image_large:  imgUris.large  || "",
    card_faces:   cardFaces,
  };
}
