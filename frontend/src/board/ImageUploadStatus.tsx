import { Button } from '@/components/ui/button'
import type { ImageUploadState } from './imageUploads.ts'
import { imageMessages as m } from './board.messages.ts'

/** «Загрузка изображения… 40%» while images are uploaded; goes under the header, in a region that is read out. */
export function ImageUploadProgress({ state }: { state: ImageUploadState }) {
  if (state.count === 0) return null
  const percent = Math.round(state.progress * 100)
  return (
    <p className="border-b bg-muted px-3 py-1 text-sm text-muted-foreground">
      {state.count > 1 ? m.uploadingMany(state.count, percent) : m.uploading(percent)}
    </p>
  )
}

/** Why an image was not added, under the header until the participant dismisses it. */
export function ImageUploadError({ state, onDismiss }: { state: ImageUploadState; onDismiss: () => void }) {
  if (!state.error) return null
  return (
    <div role="alert" className="flex items-center gap-x-3 border-b bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
      <span className="flex-1">{state.error}</span>
      <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
        {m.dismiss}
      </Button>
    </div>
  )
}
