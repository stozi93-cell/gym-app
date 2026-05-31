const AVATAR_SIZE = 512;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function createCroppedAvatar(src, crop) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  );

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.86);
  });

  if (!blob) throw new Error("Avatar image could not be prepared");
  return blob;
}
