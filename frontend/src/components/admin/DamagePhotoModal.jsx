export function DamagePhotoModal({ photo, onClose }) {
  if (!photo) return null;

  return (
    <div className="damage-modal-backdrop" onClick={onClose}>
      <div className="damage-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="damage-modal-header">
          <div>
            <h3>{photo.vin}</h3>
            <span className="eyebrow">
              {photo.model}
              {photo.yardName ? ` · ${photo.yardName}` : ""}
            </span>
          </div>
          <button type="button" className="damage-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="damage-modal-body">
          <img src={photo.src} alt="Damage evidence" className="damage-modal-img" />
          <div className="damage-modal-caption">
            <strong>Damage remarks</strong>
            <p>{photo.remark}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
