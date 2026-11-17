export function formatCaptureTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join("_");
}

export function nextAvailableFilename(
  directory: string,
  baseName: string,
  extension: string,
  exists: (path: string) => boolean,
): string {
  const normalizedExtension = extension.startsWith(".") ? extension : `.${extension}`;
  let filename = `${baseName}${normalizedExtension}`;
  let suffix = 2;
  while (exists(`${directory}\\${filename}`)) {
    filename = `${baseName}-${suffix}${normalizedExtension}`;
    suffix += 1;
  }
  return `${directory}\\${filename}`;
}
