import { Link } from "react-router-dom";
import { privacyPolicy } from "./privacyPolicy";

const Privacy = () => {
  return (
    <div className="app">
      <div className="panel stack">
        <div className="brand">Hey Social</div>
        <p className="muted">Politique de confidentialite</p>
        <Link className="button secondary" to="/">
          Retour
        </Link>
      </div>
      <div className="panel" style={{ gridColumn: "span 2" }}>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{privacyPolicy}</pre>
      </div>
    </div>
  );
};

export default Privacy;
