export async function readBotAvatar(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  ) {
    throw new Error('Choose a PNG, JPEG, WebP or GIF image smaller than 5 MB.')
  }
  const image = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 160
    const context = canvas.getContext('2d')
    if (!context || !image.width || !image.height) {
      throw new Error('Could not read this image.')
    }
    const side = Math.min(image.width, image.height)
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      160,
      160
    )
    const result = canvas.toDataURL('image/png')
    if (result.length > 180_000) {
      throw new Error('Choose a simpler image for this bot avatar.')
    }
    return result
  } finally {
    image.close()
  }
}
