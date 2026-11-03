function normalizeInstahyreJobKey(href) {
  const match = String(href || '').match(/\/job(?:-|\/)(\d+)/i);
  return match ? `/job-${match[1]}` : '';
}

module.exports = { normalizeInstahyreJobKey };
