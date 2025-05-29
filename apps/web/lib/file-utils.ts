export function sanitizeFileName(fileName: string): string {
  // Replace spaces and special characters with underscores
  // Remove any characters that aren't alphanumeric, underscores, dots, or dashes
  const name = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  // Ensure the name is unique by adding a timestamp
  const timestamp = Date.now()
  const ext = name.split('.').pop()
  const baseName = name.split('.').slice(0, -1).join('.')
  return `${baseName}_${timestamp}.${ext}`
}