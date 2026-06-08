export function toPublicDataStatus(status) {
  if (Array.isArray(status)) {
    return status.map((item) => toPublicDataStatus(item));
  }
  if (!status || typeof status !== 'object') return status;

  const publicStatus = {};
  for (const [key, value] of Object.entries(status)) {
    if (key === 'root' || key === 'records') continue;
    publicStatus[key] = toPublicDataStatus(value);
  }
  return publicStatus;
}
