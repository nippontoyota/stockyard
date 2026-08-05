import React, { useRef, useState } from "react";
import { yards, yardsByRegion, updateVehicleAdmin } from "../../stockyardLogic.js";
import { adminOverrideVehicle, adminReportVehicleDamage } from "../../api.js";
import { ConfirmDialog } from "../ConfirmDialog.jsx";

function compressImage(file, maxDimension = 1000, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(e.target.result || "");
      img.src = e.target.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export function ManualOverride({ state, setState, onSuccess, onError, onRefresh }) {
  const [vin, setVin] = useState("");
  const [yardId, setYardId] = useState(yards[0]?.id || "");
  const [status, setStatus] = useState("out");
  const [reason, setReason] = useState("");
  const [damageImage, setDamageImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const damagePhotoInputRef = useRef(null);

  const selectedYard = yards.find((y) => y.id === yardId);
  const isDamage = status === "damaged";
  const existingVehicle = vin.trim() ? state?.vehicles?.[vin.trim().toUpperCase()] : null;
  const existingYardId = existingVehicle?.currentYardId || "";
  const needsDamageYard = isDamage && !existingYardId;

  const consequence = isDamage
    ? `Opens a damage report for ${vin || "this VIN"} with your note and photo. Status and yard stay unchanged.`
    : status === "out"
      ? `Marks ${vin || "this VIN"} as OUT and clears its current yard.`
      : `Marks ${vin || "this VIN"} as IN at ${selectedYard ? `${selectedYard.code} · ${selectedYard.name}` : "the selected yard"}.`;

  async function handleDamagePhotoSelect(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      setFormError("Photo is too large (max 10MB). Try a smaller image.");
      return;
    }
    try {
      const compressed = await compressImage(selected, 1000, 0.8);
      if (compressed.length > 3 * 1024 * 1024) {
        setFormError("Compressed photo still too large (max 3MB).");
        return;
      }
      setDamageImage(compressed);
      setFormError("");
    } catch {
      setFormError("Could not read that photo.");
    } finally {
      event.target.value = "";
    }
  }

  function requestSubmit(event) {
    event.preventDefault();
    setFormError("");
    if (!vin.trim() || !reason.trim()) return;
    if (isDamage && !damageImage) {
      setFormError("Attach or capture a photo of the vehicle damage.");
      return;
    }
    if (needsDamageYard && !yardId) {
      setFormError("Select a yard for this damage report.");
      return;
    }
    setConfirmOpen(true);
  }

  async function applyOverride() {
    setLoading(true);
    try {
      const targetVin = vin.trim().toUpperCase();
      if (isDamage) {
        await adminReportVehicleDamage(
          targetVin,
          reason.trim(),
          damageImage,
          needsDamageYard ? yardId : existingYardId || undefined
        );
        setVin("");
        setReason("");
        setDamageImage("");
        onSuccess?.(`Damage reported for ${targetVin}.`);
        onRefresh?.();
        setConfirmOpen(false);
        return;
      }

      await adminOverrideVehicle(targetVin, status, reason, status === "in" ? yardId : null);
      setState(updateVehicleAdmin(state, { vin: targetVin, yardId, status, reason }));
      setVin("");
      setReason("");
      onSuccess?.(
        status === "out"
          ? `Forced OUT for ${targetVin}.`
          : `Set IN at ${selectedYard ? `${selectedYard.code} · ${selectedYard.name}` : yardId} for ${targetVin}.`
      );
      setConfirmOpen(false);
    } catch (err) {
      const msg = err.message || "Override failed.";
      setFormError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  const submitDisabled =
    loading ||
    !vin.trim() ||
    !reason.trim() ||
    (isDamage && !damageImage) ||
    (needsDamageYard && !yardId);

  const confirmTitle = isDamage
    ? "Report damage?"
    : status === "out"
      ? "Force close OUT?"
      : "Reassign as IN?";

  const confirmLabel = isDamage
    ? "Report damage"
    : status === "out"
      ? "Force close OUT"
      : "Reassign as IN";

  const buttonLabel = loading
    ? "Applying…"
    : isDamage
      ? "Report damage"
      : status === "out"
        ? "Force close OUT"
        : "Reassign as IN";

  return (
    <>
      <form className="stack admin-tool-form" onSubmit={requestSubmit}>
        <p className="field-hint">Use only when a physical scan failed. Every change is audited with your note.</p>
        <label htmlFor="override-vin">VIN</label>
        <input
          id="override-vin"
          required
          value={vin}
          onChange={(event) => setVin(event.target.value.toUpperCase())}
          placeholder="17-character VIN"
          autoComplete="off"
          spellCheck={false}
        />
        <label htmlFor="override-status">What should happen?</label>
        <select
          id="override-status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            if (event.target.value !== "damaged") setDamageImage("");
          }}
        >
          <option value="out">Force close — mark vehicle OUT</option>
          <option value="in">Reassign — mark vehicle IN at a yard</option>
          <option value="damaged">Mark vehicle as damaged</option>
        </select>
        {(status === "in" || needsDamageYard) && (
          <>
            <label htmlFor="override-yard">
              {needsDamageYard ? "Yard for damage report" : "Destination yard"}
            </label>
            <select id="override-yard" value={yardId} onChange={(event) => setYardId(event.target.value)} required>
              {yardsByRegion().map(({ region, yards: regionYards }) => (
                <optgroup key={region} label={region}>
                  {regionYards.map((yard) => (
                    <option value={yard.id} key={yard.id}>
                      {yard.code} · {yard.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </>
        )}
        <label htmlFor="override-reason">{isDamage ? "Damage details" : "Why are you changing this?"}</label>
        <textarea
          id="override-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            isDamage
              ? "Type of damage & details..."
              : "e.g. Vehicle left without OUT scan — confirmed with yard supervisor"
          }
          rows={3}
        />
        {isDamage && (
          <div className="damage-inputs stack">
            <input
              ref={damagePhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleDamagePhotoSelect}
              style={{ display: "none" }}
            />
            <div className="damage-photo-upload-row">
              <button
                type="button"
                className="ghost damage-photo-btn"
                onClick={() => damagePhotoInputRef.current?.click()}
              >
                <span className="material-symbols-outlined">add_a_photo</span>
                <span>{damageImage ? "Change photo" : "Take damage photo"}</span>
              </button>
              {damageImage && (
                <div className="damage-thumb-wrap">
                  <img src={damageImage} alt="Damage preview" className="damage-thumb" />
                  <button
                    type="button"
                    className="damage-thumb-remove"
                    onClick={() => setDamageImage("")}
                    title="Remove photo"
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="notice info" role="status">
          <strong>Result:</strong> {consequence}
        </div>
        {formError && <p className="notice bad">{formError}</p>}
        <button className="primary" disabled={submitDisabled}>
          {buttonLabel}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        message={
          <>
            <p>{consequence}</p>
            <p className="field-hint">
              {isDamage
                ? "Opens an unresolved damage flag in Attention. IN/OUT and yard are not changed."
                : "This is logged as a manual admin override."}
            </p>
          </>
        }
        confirmLabel={confirmLabel}
        tone="danger"
        loading={loading}
        onConfirm={applyOverride}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
