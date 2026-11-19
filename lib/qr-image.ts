import jsQR from "jsqr";

export function decode(image: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1400 / Math.max(width,height));
  canvas.width = Math.round(width*scale);
  canvas.height = Math.round(height*scale);
  const context = canvas.getContext("2d", {willReadFrequently:true});
  if (!context || !canvas.width || !canvas.height) return;
  context.drawImage(image,0,0,canvas.width,canvas.height);
  const buffer = context.getImageData(0,0,canvas.width,canvas.height);
  return jsQR(buffer.data,buffer.width,buffer.height,{inversionAttempts:"attemptBoth"})?.data;
}

export async function decodeFile(image: File) {
  const url = URL.createObjectURL(image);
  try {
    const picture = new window.Image();
    picture.src = url;
    await picture.decode();
    return decode(picture,picture.naturalWidth,picture.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
