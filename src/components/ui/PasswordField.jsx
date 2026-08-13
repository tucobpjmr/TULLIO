// src/components/ui/PasswordField.jsx
// Input password con icona a occhio (👁️/🙈) per mostrare/nascondere il testo.
// `inputStyle` adatta il campo al tema della schermata (login scuro, profilo
// chiaro). La visibilità può essere controllata dall'esterno (show + onToggle)
// — utile per sincronizzare più campi — oppure gestita internamente.
// Ogni altra prop (value, onChange, placeholder, autoComplete, onFocus…) viene
// inoltrata all'<input>.
import { useState } from "react";
import { relative } from "../../styles/common.js";

export function PasswordField({ inputStyle, show: showProp, onToggle, eyeColor, ...inputProps }) {
  const [showInner, setShowInner] = useState(false);
  const controlled = showProp !== undefined;
  const show = controlled ? showProp : showInner;
  const toggle = controlled ? onToggle : () => setShowInner(s => !s);

  return (
    <div style={relative}>
      <input
        {...inputProps}
        type={show ? "text" : "password"}
        style={{ ...inputStyle, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={toggle}
        tabIndex={-1}
        aria-label={show ? "Nascondi password" : "Mostra password"}
        title={show ? "Nascondi password" : "Mostra password"}
        style={{ ...eyeBtnStyle, color: eyeColor || "inherit" }}
      >
        {show ? "🙈" : "👁️"}
      </button>
    </div>
  );
}

const eyeBtnStyle = {
  position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)",
  background: "none", border: "none", cursor: "pointer", fontSize: 16,
  padding: 4, lineHeight: 1, opacity: 0.85,
};
