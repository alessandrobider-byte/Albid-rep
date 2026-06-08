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
    "User-Agent":   "MTGCubeManager/1.0 (https://project-71rr6.vercel.app)",
    "Accept":       "application/json",
    "Content-Type": "application/json",
  };

  // Separate split cards (contain "//") from normal cards
  const splitCards  = identifiers.filter(id => id.name.includes("//"));
  const normalCards = identifiers.filter(id => !id.name.includes("//"));

  const found = [];
  const notFound = [];

  // 1. Normal cards via /cards/collection (batch of 75)
  if (normalCards.length > 0) {
    try {
      const response = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers,
        body: JSON.stringify({ identifiers: normalCards }),
      });
      const data = await response.json();
      if (response.ok) {
        (data.data || []).forEach(card => found.push(buildCardData(card)));
        (data.not_found || []).forEach(id => notFound.push(id.name || ""));
      }
    } catch(err) {
      normalCards.forEach(id => notFound.push(id.name));
    }
  }

  // 2. Split cards via fuzzy search one by one
  for (const id of splitCards) {
    try {
      const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(id.name)}${id.set ? "&set=" + encodeURIComponent(id.set) : ""}`;
      const r = await fetch(url, { headers });
      const d = await r.json();
      if (r.ok && d.object !== "error") {
        found.push(buildCardData(d));
      } else {
        notFound.push(id.name);
      }
    } catch {
      notFound.push(id.name);
    }
  }

  return res.status(200).json({ found, not_found: notFound });
}

function buildCardData(data) {
  const imgUris   = data.image_uris || data.card_faces?.[0]?.image_uris || {};
  const typeParts = (data.type_line || "").split(" — ");
  return {
    id:           data.id,
    name:         data.name,
    set:          data.set,
    set_name:     data.set_name,
    mana_cost:    data.mana_cost || data.card_faces?.[0]?.mana_cost || "",
    colors:       data.colors || data.color_identity || [],
    cmc:          data.cmc,
    type_line:    data.type_line || "",
    types:        typeParts[0]?.trim().split(" ").filter(Boolean) || [],
    subtypes:     typeParts[1]?.trim().split(" ").filter(Boolean) || [],
    oracle_text:  data.oracle_text || data.card_faces?.[0]?.oracle_text || "",
    power:        data.power  ?? null,
    toughness:    data.toughness ?? null,
    rarity:       data.rarity,
    image_normal: imgUris.normal || "",
    image_large:  imgUris.large  || "",
  };
}
