import { createClient } from '@/lib/supabase/client'

interface ClientUploadOptions {
  file: File
  filePath: string
  bucket: string
}

export async function uploadFileDirectlyToSupabase({
  file,
  filePath,
  bucket
}: ClientUploadOptions): Promise<{ error?: string }> {
  const supabase = createClient()

  try {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Direct upload error:', uploadError)
      return { error: uploadError.message }
    }

    return {}
  } catch (error) {
    console.error('Unexpected error during direct upload:', error)
    return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
  }
}

export function isLargeFile(file: File): boolean {
  const MAX_SIZE = 4 * 1024 * 1024 // 4MB in bytes
  return file.size > MAX_SIZE
}