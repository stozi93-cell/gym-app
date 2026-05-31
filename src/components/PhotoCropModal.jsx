import { useState } from "react";
import Cropper from "react-easy-crop";
import { createCroppedAvatar } from "../utils/cropImage";

export default function PhotoCropModal({ imageURL, onCancel, onSave, onError }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!croppedArea || saving) return;

    try {
      setSaving(true);
      const avatar = await createCroppedAvatar(imageURL, croppedArea);
      const saved = await onSave(avatar);
      if (!saved) setSaving(false);
    } catch (error) {
      console.error("Avatar crop failed", error);
      onError();
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Namesti profilnu fotografiju"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
    >
      <div className="w-full max-w-[360px] rounded-lg bg-neutral-900 p-4 shadow-xl">
        <h2 className="text-base font-semibold text-white">
          Namesti fotografiju
        </h2>

        <div className="relative mx-auto mt-4 h-[min(76vw,300px)] w-full max-w-[300px] overflow-hidden rounded-lg bg-black">
          <Cropper
            image={imageURL}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, areaPixels) => setCroppedArea(areaPixels)}
          />
        </div>

        <label className="mt-4 block text-xs text-neutral-300">
          Uvećanje
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="mt-2 w-full accent-blue-500"
          />
        </label>

        <div className="mt-4 flex justify-end gap-4 text-sm">
          <button disabled={saving} onClick={onCancel} className="text-neutral-300 disabled:opacity-50">
            Otkaži
          </button>
          <button disabled={!croppedArea || saving} onClick={save} className="text-blue-400 disabled:opacity-50">
            {saving ? "Čuvanje..." : "Sačuvaj"}
          </button>
        </div>
      </div>
    </div>
  );
}
