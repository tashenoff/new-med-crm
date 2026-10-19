import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./theme/curai.variables.css";
import "./theme/curai.css";
import "./theme/curai-foundations.css";
import "./theme/curai-search.css";
import "./theme/curai-doctors.css";
import "./theme/curai-patients.css";
import "./theme/curai-clinical.css";
import "./theme/curai-directories.css";
import "./theme/curai-consultation-picker.css";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

import "./theme/curai-payment-r21.css";

import "./theme/curai-treatment-plans.css";
import "./theme/curai-communication.css";

import "./theme/curai-glass-headers.css";
