import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  yards,
  yardsByRegion,
  normalizeVin,
  isValidVin,
  CAR_MODELS,
  DRIVE_TYPES,
} from "../../stockyardLogic.js";
import { adminImportVehicles } from "../../api.js";
import { ConfirmDialog } from "../ConfirmDialog.jsx";

function findYard(value) {
  if (!value) return null;
  const search = String(value).toLowerCase().trim();
  const byId = yards.find((y) => y.id.toLowerCase() === search);
  if (byId) return byId;
  const byExactName = yards.find((y) => y.name.toLowerCase() === search);
  if (byExactName) return byExactName;
  const byPartialName = yards.find((y) => y.name.toLowerCase().includes(search));
  if (byPartialName) return byPartialName;
  const byCode = yards.filter((y) => y.code.toLowerCase() === search);
  if (byCode.length === 1) return byCode[0];
  return null;
}

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

export function AddToYard({ onSuccess, onError, onRefresh }) {
  const [mode, setMode] = useState("single");
  const damagePhotoInputRef = useRef(null);

  // Single form
  const [yardId, setYardId] = useState("");
  const [vin, setVin] = useState("");
  const [model, setModel] = useState("");
  const [keyNo, setKeyNo] = useState("");
  const [driveType, setDriveType] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [damageRemark, setDamageRemark] = useState("");
  const [damageImage, setDamageImage] = useState("");
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError] = useState("");
  const [singleOk, setSingleOk] = useState("");

  // Bulk
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [clientRejected, setClientRejected] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function resetDamageFields() {
    setDamaged(false);
    setDamageRemark("");
    setDamageImage("");
  }

  async function handleDamagePhotoSelect(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      setSingleError("Photo is too large (max 10MB). Try a smaller image.");
      return;
    }
    try {
      const compressed = await compressImage(selected, 1000, 0.8);
      if (compressed.length > 3 * 1024 * 1024) {
        setSingleError("Compressed photo still too large (max 3MB).");
        return;
      }
      setDamageImage(compressed);
      setSingleError("");
    } catch {
      setSingleError("Could not read that photo.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSingleSubmit(event) {
    event.preventDefault();
    setSingleError("");
    setSingleOk("");

    const normalized = normalizeVin(vin);
    if (!yardId) {
      setSingleError("Select a stockyard.");
      return;
    }
    if (!normalized || !isValidVin(normalized)) {
      setSingleError("Enter a valid VIN.");
      return;
    }
    if (!model) {
      setSingleError("Select a model.");
      return;
    }
    if (damaged && !damageRemark.trim()) {
      setSingleError("Describe the damage.");
      return;
    }
    if (damaged && !damageImage) {
      setSingleError("Attach or capture a photo of the vehicle damage.");
      return;
    }

    setSingleLoading(true);
    try {
      const result = await adminImportVehicles([
        {
          vin: normalized,
          yard_id: yardId,
          model,
          key_no: keyNo.trim() || null,
          drive_type: driveType || null,
          damaged: damaged || undefined,
          damage_remark: damaged ? damageRemark.trim() : null,
          damage_image: damaged ? damageImage : null,
        },
      ]);
      const rejected = result.rejected || [];
      if (result.imported === 1) {
        const yard = yards.find((y) => y.id === yardId);
        setSingleOk(
          `Added ${normalized} as IN at ${yard ? `${yard.code} · ${yard.name}` : yardId}${
            damaged ? " (damage reported)" : ""
          }.`
        );
        setVin("");
        setModel("");
        setKeyNo("");
        setDriveType("");
        resetDamageFields();
        onSuccess?.(`Added ${normalized} to stockyard.`);
        onRefresh?.();
      } else {
        const reason = rejected[0]?.reason || "Could not add vehicle.";
        setSingleError(`${normalized}: ${reason}`);
        onError?.(reason);
      }
    } catch (err) {
      const msg = err.message || "Could not add vehicle.";
      setSingleError(msg);
      onError?.(msg);
    } finally {
      setSingleLoading(false);
    }
  }

  function handleFileDrop(e) {
    e.preventDefault();
    const droppedFile = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (!droppedFile) return;

    setFile(droppedFile);
    setBulkError(null);
    setBulkResult(null);
    setBulkLoading(true);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (rows.length < 2) throw new Error("File is empty or missing headers.");

        const headers = rows[0].map((h) => String(h).toLowerCase().trim());
        const vinCol = headers.findIndex((h) => h.includes("vin"));
        const modelCol = headers.findIndex((h) => h.includes("model"));
        const yardCol = headers.findIndex(
          (h) => h.includes("yard") || h.includes("destination") || h.includes("location")
        );

        if (vinCol === -1) throw new Error("Could not find a VIN column.");

        const extracted = [];
        const rejected = [];
        const seen = new Set();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[vinCol]) continue;

          const rawVin = String(row[vinCol]);
          const normalizedVin = normalizeVin(rawVin);
          const rawYard = yardCol !== -1 ? row[yardCol] : null;
          const matchedYard = findYard(rawYard);
          const rawModel = modelCol !== -1 ? String(row[modelCol] || "").trim() : "";

          if (!normalizedVin || !isValidVin(normalizedVin)) {
            rejected.push({
              vin: normalizedVin || rawVin.trim().toUpperCase() || "(blank)",
              reason: "invalid VIN",
            });
            continue;
          }

          if (seen.has(normalizedVin)) {
            rejected.push({ vin: normalizedVin, reason: "duplicate in file" });
            continue;
          }
          seen.add(normalizedVin);

          if (!matchedYard) {
            rejected.push({
              vin: normalizedVin,
              reason: rawYard
                ? `invalid or missing yard (${String(rawYard)})`
                : "invalid or missing yard",
            });
            continue;
          }

          extracted.push({
            vin: normalizedVin,
            model: rawModel || null,
            yard_id: matchedYard.id,
            yardCode: matchedYard.code,
            yardName: matchedYard.name,
          });
        }

        if (extracted.length === 0 && rejected.length === 0) {
          throw new Error("No VIN rows found in this file.");
        }

        setParsedData(extracted);
        setClientRejected(rejected);
        if (extracted.length === 0) {
          setBulkResult({
            imported: 0,
            skipped: rejected.length,
            total: rejected.length,
            rejected,
          });
        }
      } catch (err) {
        setBulkError(err.message || "Failed to parse the Excel file.");
        setParsedData([]);
        setClientRejected([]);
      } finally {
        setBulkLoading(false);
      }
    };
    reader.readAsArrayBuffer(droppedFile);
  }

  function clearBulk() {
    setParsedData([]);
    setClientRejected([]);
    setFile(null);
    setBulkResult(null);
    setBulkError(null);
  }

  function requestConfirm() {
    if (parsedData.length === 0) return;
    if (clientRejected.length > 0) {
      setConfirmOpen(true);
      return;
    }
    handleBulkConfirm();
  }

  async function handleBulkConfirm() {
    if (parsedData.length === 0) return;
    setBulkLoading(true);
    setBulkError(null);
    setConfirmOpen(false);
    try {
      const payload = parsedData.map(({ vin: v, model: m, yard_id }) => ({
        vin: v,
        model: m,
        yard_id,
      }));
      const result = await adminImportVehicles(payload);
      const serverRejected = result.rejected || [];
      const allRejected = [...clientRejected, ...serverRejected];
      setBulkResult({
        imported: result.imported || 0,
        skipped: allRejected.length,
        total: (result.total || 0) + clientRejected.length,
        rejected: allRejected,
      });
      setParsedData([]);
      setFile(null);
      if (result.imported > 0) {
        onSuccess?.(`Added ${result.imported} vehicle${result.imported === 1 ? "" : "s"} to stockyards.`);
        onRefresh?.();
      }
    } catch (err) {
      setBulkError("Import failed: " + (err.message || "unknown error"));
      onError?.(err.message || "Import failed.");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="stack add-to-yard">
      <div className="segmented" role="tablist" aria-label="Add to yard mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "single"}
          className={mode === "single" ? "active" : ""}
          onClick={() => setMode("single")}
        >
          Single
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "bulk"}
          className={mode === "bulk" ? "active" : ""}
          onClick={() => setMode("bulk")}
        >
          Bulk Excel
        </button>
      </div>

      {mode === "single" && (
        <form className="stack admin-tool-form add-to-yard-form" onSubmit={handleSingleSubmit}>
          <p className="field-hint">
            Creates a new vehicle as <strong>IN</strong> at the chosen yard. Existing VINs are rejected — never overwritten.
          </p>

          <label htmlFor="add-yard">Stockyard</label>
          <select
            id="add-yard"
            value={yardId}
            onChange={(e) => setYardId(e.target.value)}
            required
          >
            <option value="">Select stockyard</option>
            {yardsByRegion().map(({ region, yards: regionYards }) => (
              <optgroup key={region} label={region}>
                {regionYards.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.code} · {y.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <label htmlFor="add-vin">VIN</label>
          <input
            id="add-vin"
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            placeholder="Enter VIN"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />

          <label htmlFor="add-model">Model</label>
          <select
            id="add-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          >
            <option value="">Select model</option>
            {CAR_MODELS.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>

          <label htmlFor="add-key">Key No.</label>
          <input
            id="add-key"
            value={keyNo}
            onChange={(e) => setKeyNo(e.target.value)}
            placeholder="Key No (optional, e.g. K-101)"
          />

          <label htmlFor="add-drive">Drive Type</label>
          <select
            id="add-drive"
            value={driveType}
            onChange={(e) => setDriveType(e.target.value)}
          >
            <option value="">Select Drive Type</option>
            {DRIVE_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <label className="check">
            <input
              type="checkbox"
              checked={damaged}
              onChange={(event) => {
                setDamaged(event.target.checked);
                if (!event.target.checked) {
                  setDamageRemark("");
                  setDamageImage("");
                }
              }}
            />{" "}
            Car damaged
          </label>
          {damaged && (
            <div className="damage-inputs stack">
              <textarea
                value={damageRemark}
                onChange={(event) => setDamageRemark(event.target.value)}
                rows={3}
                placeholder="Type of damage & details..."
                required
              />
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

          {singleError && (
            <div className="notice warn" role="alert">
              {singleError}
            </div>
          )}
          {singleOk && (
            <div className="notice ok" role="status">
              {singleOk}
            </div>
          )}

          <button type="submit" className="primary" disabled={singleLoading}>
            {singleLoading ? "Adding…" : "Add to stockyard"}
          </button>
        </form>
      )}

      {mode === "bulk" && (
        <div className="stack add-to-yard-bulk">
          <p className="field-hint">
            Excel with <strong>VIN</strong>, optional <strong>Model</strong>, and <strong>Yard</strong> columns.
            Existing VINs are skipped and listed below — nothing is overwritten.
          </p>

          {!parsedData.length && !bulkResult && (
            <div
              className="upload-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => document.getElementById("add-yard-file").click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") document.getElementById("add-yard-file").click();
              }}
            >
              <span className="material-symbols-outlined upload-dropzone-icon">upload_file</span>
              <strong>{bulkLoading ? "Reading file…" : "Drop Excel here or click to browse"}</strong>
              <p className="field-hint">{file ? file.name : ".xlsx / .xls"}</p>
              <input
                id="add-yard-file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileDrop}
                hidden
              />
            </div>
          )}

          {bulkError && (
            <div className="notice warn">
              <strong>Could not import:</strong> {bulkError}
            </div>
          )}

          {parsedData.length > 0 && (
            <div className="transit-preview stack">
              <div className="transit-preview-header">
                <div>
                  <h3>{parsedData.length} ready to add as IN</h3>
                  <p className="field-hint">
                    {clientRejected.length > 0
                      ? `${clientRejected.length} already rejected (invalid VIN / yard)`
                      : "All rows matched a yard"}
                  </p>
                </div>
                <button type="button" className="ghost" onClick={clearBulk} disabled={bulkLoading}>
                  Cancel
                </button>
              </div>

              {clientRejected.length > 0 && (
                <div className="notice warn">
                  {clientRejected.length} row{clientRejected.length === 1 ? "" : "s"} rejected before upload —
                  see the list after you confirm, or cancel and fix the file.
                </div>
              )}

              <div className="table-wrapper transit-preview-table">
                <table className="damaged-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>VIN</th>
                      <th>Model</th>
                      <th>Yard</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.map((v, i) => (
                      <tr key={v.vin}>
                        <td className="muted-cell">{i + 1}</td>
                        <td className="damaged-vin">{v.vin}</td>
                        <td>{v.model || "—"}</td>
                        <td>
                          {v.yardCode} · {v.yardName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="primary"
                onClick={requestConfirm}
                disabled={bulkLoading || parsedData.length === 0}
              >
                {bulkLoading ? "Importing…" : `Add ${parsedData.length} to stockyards`}
                <span className="material-symbols-outlined">cloud_upload</span>
              </button>
            </div>
          )}

          {bulkResult && (
            <div className="stack add-to-yard-result">
              <div className={`notice ${bulkResult.imported > 0 ? "ok" : "warn"}`}>
                <strong>Done:</strong> {bulkResult.imported} imported · {bulkResult.skipped} rejected ·{" "}
                {bulkResult.total} total
              </div>

              {bulkResult.rejected?.length > 0 && (
                <div className="table-wrapper">
                  <table className="damaged-table">
                    <thead>
                      <tr>
                        <th>VIN</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResult.rejected.map((row, i) => (
                        <tr key={`${row.vin}-${i}`}>
                          <td className="damaged-vin">{row.vin}</td>
                          <td>{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button type="button" className="ghost" onClick={clearBulk}>
                Import another file
              </button>
            </div>
          )}

          <ConfirmDialog
            open={confirmOpen}
            title="Import with rejected rows?"
            message={
              <>
                <p>
                  {clientRejected.length} row{clientRejected.length === 1 ? "" : "s"} already failed validation.
                </p>
                <p>
                  Add the {parsedData.length} valid vehicle{parsedData.length === 1 ? "" : "s"} and keep the
                  rejected list?
                </p>
              </>
            }
            confirmLabel={`Add ${parsedData.length}`}
            loading={bulkLoading}
            onConfirm={handleBulkConfirm}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
