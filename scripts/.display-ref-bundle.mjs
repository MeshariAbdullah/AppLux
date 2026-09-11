// src/lib/displayRef.ts
var UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function isUuid(value) {
  return new RegExp(`^${UUID_ANYWHERE.source}$`, "i").test(value.trim());
}
function displayRef(value) {
  if (!value) return null;
  const v = value.trim();
  if (!v || UUID_ANYWHERE.test(v)) return null;
  return v;
}
export {
  displayRef,
  isUuid
};
