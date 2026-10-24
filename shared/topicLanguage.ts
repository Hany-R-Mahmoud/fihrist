export function shelfReason(normalizedName:string, locale:"ar"|"en") {
  if(normalizedName.startsWith("topic:host:")) return locale==="ar"
    ? "اتجمعت لأنها من نفس الموقع" : "Grouped because they're from the same site";
  if(normalizedName.startsWith("topic:keyword:")) return locale==="ar"
    ? "اتجمعت لأن مواضيعها عن "+normalizedName.slice("topic:keyword:".length)
    : "Grouped by topic: "+normalizedName.slice("topic:keyword:".length);
  const terms=normalizedName.slice("topic:shared:".length).replace(/:/g,", ");
  return locale==="ar" ? "اتجمعت لأنها بتشارك وسوم "+terms : "Grouped by shared tags: "+terms;
}
