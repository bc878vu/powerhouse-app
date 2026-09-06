import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase";

const MAX_MACHINE_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MACHINE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export async function uploadMachineImage(file, machineId = "new") {
  if (!(file instanceof File)) throw new Error("Please select an image file.");
  if (!ALLOWED_MACHINE_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
    throw new Error("Unsupported image format. Use JPG, PNG, WEBP, GIF or AVIF.");
  }
  if (file.size <= 0) throw new Error("The selected image is empty.");
  if (file.size > MAX_MACHINE_IMAGE_BYTES) throw new Error("Machine image must be 10 MB or smaller.");

  const safeName = String(file.name || "machine-image")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(-120) || "machine-image";
  const safeMachineId = String(machineId || "new").replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `powerhouse/machines/${safeMachineId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    cacheControl: "public,max-age=31536000,immutable"
  });

  return {
    url: await getDownloadURL(storageRef),
    path,
    name: file.name || safeName,
    type: file.type,
    size: file.size
  };
}
